package com.mkcinema.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.content.res.Configuration;
import android.media.AudioFormat;
import android.media.AudioPlaybackCaptureConfiguration;
import android.media.AudioRecord;
import android.media.AudioAttributes;
import android.media.MediaRecorder;
import android.media.projection.MediaProjection;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.util.DisplayMetrics;
import android.view.WindowManager;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import org.webrtc.AudioSource;
import org.webrtc.AudioTrack;
import org.webrtc.DefaultVideoDecoderFactory;
import org.webrtc.DefaultVideoEncoderFactory;
import org.webrtc.EglBase;
import org.webrtc.IceCandidate;
import org.webrtc.MediaConstraints;
import org.webrtc.MediaStreamTrack;
import org.webrtc.PeerConnection;
import org.webrtc.PeerConnectionFactory;
import org.webrtc.RtpCapabilities;
import org.webrtc.RtpParameters;
import org.webrtc.RtpSender;
import org.webrtc.RtpTransceiver;
import org.webrtc.ScreenCapturerAndroid;
import org.webrtc.SdpObserver;
import org.webrtc.SessionDescription;
import org.webrtc.SurfaceTextureHelper;
import org.webrtc.VideoSource;
import org.webrtc.VideoTrack;
import org.webrtc.audio.JavaAudioDeviceModule;

/** 1.16.0: screen mirroring. This phone's screen (and, on Android 10+, the sound of apps that allow it) goes to another
    MKCinema screen over WebRTC (libwebrtc, webrtc-sdk build, BSD). The page does the pairing and carries the offer, the
    answer and the candidates over its own realtime channel: this service only captures, encodes and sends. It is a
    foreground service of type mediaProjection, which Android 14 requires before the capture may start. Netflix-style apps
    that mark their windows secure come through black: Android does that, not MKCinema. */
public class MirrorService extends Service {
    static final String CHANNEL = "mirror";
    static final int NOTE_ID = 7311;
    /** the consent result and the page's settings, handed over by MainActivity */
    static Intent consent; static int consentCode; static String config = "{}";
    static volatile MirrorService live;

    HandlerThread thread; Handler h;
    EglBase egl; PeerConnectionFactory factory; PeerConnection pc; ScreenCapturerAndroid cap; SurfaceTextureHelper helper;
    VideoSource vsrc; VideoTrack vtrack; AudioSource asrc; AudioTrack atrack; JavaAudioDeviceModule adm;
    AudioRecord appSound; final byte[] ring = new byte[48000 * 2 * 2 / 4]; int ringLen; // up to 250 ms of 48 kHz stereo
    int w, h0, maxSide = 1280, fps = 30, kbps = 4000;
    boolean stopping, sound;
    final List<IceCandidate> early = new ArrayList<>();
    boolean haveAnswer;

    static void emit(JSONObject o) { MainActivity.mirrorEvent(o.toString()); }
    static void emit(String t) { try { emit(new JSONObject().put("t", t)); } catch (Exception ignored) { } }
    static boolean running() { return live != null; }

    /** the page's answer and the receiver's candidates */
    static void signal(String json) {
        MirrorService s = live; if (s == null || s.h == null) return;
        s.h.post(() -> s.onSignal(json));
    }
    static void stopNow(Context c) {
        MirrorService s = live; if (s != null && s.h != null) s.h.post(s::finish);
        else c.stopService(new Intent(c, MirrorService.class));
    }

    @Override public IBinder onBind(Intent i) { return null; }

    @Override public int onStartCommand(Intent i, int flags, int id) {
        if (i != null && "stop".equals(i.getAction())) { stopNow(this); return START_NOT_STICKY; }
        if (live != null) return START_NOT_STICKY;
        Intent data = consent; consent = null;
        if (data == null) { stopSelf(); return START_NOT_STICKY; }
        // Android 14: the foreground service of type mediaProjection must be running before getMediaProjection
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTE_ID, note(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
            else startForeground(NOTE_ID, note());
        } catch (Exception e) { emit("error"); stopSelf(); return START_NOT_STICKY; }
        live = this;
        thread = new HandlerThread("mirror"); thread.start(); h = new Handler(thread.getLooper());
        final String cfg = config;
        h.post(() -> { try { begin(data, cfg); } catch (Throwable e) { android.util.Log.w("MKMirror", "start", e); emitErr(e); finish(); } });
        return START_NOT_STICKY;
    }

    static void emitErr(Throwable e) { try { emit(new JSONObject().put("t", "error").put("why", String.valueOf(e.getMessage()))); } catch (Exception ignored) { } }

    Notification note() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            if (nm.getNotificationChannel(CHANNEL) == null) nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Screen mirroring", NotificationManager.IMPORTANCE_LOW));
            b = new Notification.Builder(this, CHANNEL);
        } else b = new Notification.Builder(this);
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        String to = ""; try { to = new JSONObject(config).optString("to", ""); } catch (Exception ignored) { }
        b.setSmallIcon(android.R.drawable.ic_menu_share).setContentTitle("Showing your screen" + (to.isEmpty() ? "" : " on " + to))
            .setContentText("Everything on your screen is visible there. Tap Stop to end.").setOngoing(true)
            .setContentIntent(PendingIntent.getActivity(this, 11, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE))
            .addAction(new Notification.Action.Builder(null, "Stop", PendingIntent.getService(this, 12, new Intent(this, MirrorService.class).setAction("stop"), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE)).build());
        return b.build();
    }

    void size() {
        DisplayMetrics m = new DisplayMetrics();
        ((WindowManager) getSystemService(WINDOW_SERVICE)).getDefaultDisplay().getRealMetrics(m);
        int a = m.widthPixels, b = m.heightPixels; float k = Math.min(1f, maxSide / (float) Math.max(a, b));
        // even sizes: encoders reject odd ones
        w = Math.max(2, Math.round(a * k) & ~1); h0 = Math.max(2, Math.round(b * k) & ~1);
    }

    void begin(Intent data, String cfgJson) throws Exception {
        JSONObject cfg = new JSONObject(cfgJson);
        maxSide = Math.max(640, Math.min(1920, cfg.optInt("maxSide", 1280)));
        fps = Math.max(10, Math.min(60, cfg.optInt("fps", 30)));
        kbps = Math.max(500, Math.min(12000, cfg.optInt("kbps", 4000)));
        sound = Build.VERSION.SDK_INT >= 29 && cfg.optBoolean("sound", true) && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;

        PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(getApplicationContext()).createInitializationOptions());
        egl = EglBase.create();
        PeerConnectionFactory.Builder fb = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(new DefaultVideoEncoderFactory(egl.getEglBaseContext(), true, true))
            .setVideoDecoderFactory(new DefaultVideoDecoderFactory(egl.getEglBaseContext()));
        if (sound) {
            // the phone's microphone is opened by the audio module, but what it records is replaced with the sound of the
            // apps on screen (AudioPlaybackCapture): the receiver never hears the room
            adm = JavaAudioDeviceModule.builder(getApplicationContext())
                .setAudioSource(MediaRecorder.AudioSource.MIC)
                .setUseHardwareAcousticEchoCanceler(false).setUseHardwareNoiseSuppressor(false)
                .setUseStereoInput(true)
                .setAudioBufferCallback(this::onAudio)
                .createAudioDeviceModule();
            fb.setAudioDeviceModule(adm);
        }
        factory = fb.createPeerConnectionFactory();

        size();
        cap = new ScreenCapturerAndroid(data, new MediaProjection.Callback() {
            @Override public void onStop() { if (h != null) h.post(() -> { emit("ended"); finish(); }); }
        });
        helper = SurfaceTextureHelper.create("mirror-cap", egl.getEglBaseContext());
        vsrc = factory.createVideoSource(true);
        cap.initialize(helper, getApplicationContext(), vsrc.getCapturerObserver());
        cap.startCapture(w, h0, fps);
        vtrack = factory.createVideoTrack("mkv", vsrc);

        List<PeerConnection.IceServer> ice = new ArrayList<>();
        JSONArray list = cfg.optJSONArray("ice");
        if (list != null) for (int i = 0; i < list.length(); i++) {
            JSONObject s = list.optJSONObject(i); if (s == null) continue;
            List<String> urls = new ArrayList<>();
            Object u = s.opt("urls");
            if (u instanceof JSONArray) { JSONArray a = (JSONArray) u; for (int j = 0; j < a.length(); j++) urls.add(a.optString(j)); }
            else if (u != null) urls.add(String.valueOf(u));
            if (urls.isEmpty()) continue;
            PeerConnection.IceServer.Builder b = PeerConnection.IceServer.builder(urls);
            if (s.has("username")) b.setUsername(s.optString("username"));
            if (s.has("credential")) b.setPassword(s.optString("credential"));
            ice.add(b.createIceServer());
        }
        if (ice.isEmpty()) ice.add(PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer());
        PeerConnection.RTCConfiguration rc = new PeerConnection.RTCConfiguration(ice);
        rc.sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN;
        rc.continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY;
        pc = factory.createPeerConnection(rc, new Obs());
        if (pc == null) throw new IllegalStateException("no connection");

        RtpTransceiver vt = pc.addTransceiver(vtrack, new RtpTransceiver.RtpTransceiverInit(RtpTransceiver.RtpTransceiverDirection.SEND_ONLY, Collections.singletonList("mk")));
        preferH264(vt);
        limit(vt.getSender(), kbps);
        if (sound) {
            asrc = factory.createAudioSource(new MediaConstraints());
            atrack = factory.createAudioTrack("mka", asrc);
            pc.addTransceiver(atrack, new RtpTransceiver.RtpTransceiverInit(RtpTransceiver.RtpTransceiverDirection.SEND_ONLY, Collections.singletonList("mk")));
        }
        emit(new JSONObject().put("t", "live").put("w", w).put("h", h0).put("sound", sound));
        pc.createOffer(new Sdp() {
            @Override public void onCreateSuccess(SessionDescription d) {
                pc.setLocalDescription(new Sdp() {
                    @Override public void onSetSuccess() {
                        try { emit(new JSONObject().put("t", "sdp").put("sdp", new JSONObject().put("type", "offer").put("sdp", d.description))); } catch (Exception ignored) { }
                    }
                }, d);
            }
        }, new MediaConstraints());
    }

    /** hardware H.264 first when this phone has it: far less heat than VP8 in software, and every receiver decodes it */
    void preferH264(RtpTransceiver t) {
        try {
            RtpCapabilities caps = factory.getRtpSenderCapabilities(MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO);
            List<RtpCapabilities.CodecCapability> h264 = new ArrayList<>(), rest = new ArrayList<>();
            for (RtpCapabilities.CodecCapability c : caps.codecs) (("H264".equalsIgnoreCase(c.name)) ? h264 : rest).add(c);
            if (h264.isEmpty()) return;
            h264.addAll(rest); t.setCodecPreferences(h264);
        } catch (Throwable ignored) { /* older builds: the default order */ }
    }

    static void limit(RtpSender s, int kbps) {
        try {
            RtpParameters p = s.getParameters();
            for (RtpParameters.Encoding e : p.encodings) e.maxBitrateBps = kbps * 1000;
            p.degradationPreference = RtpParameters.DegradationPreference.BALANCED;
            s.setParameters(p);
        } catch (Throwable ignored) { }
    }

    void onSignal(String json) {
        if (pc == null) return;
        try {
            JSONObject o = new JSONObject(json);
            JSONObject d = o.optJSONObject("sdp");
            if (d != null && "answer".equals(d.optString("type"))) {
                pc.setRemoteDescription(new Sdp() {
                    @Override public void onSetSuccess() { h.post(() -> { haveAnswer = true; for (IceCandidate c : early) pc.addIceCandidate(c); early.clear(); }); }
                    @Override public void onSetFailure(String e) { try { emit(new JSONObject().put("t", "error").put("why", "answer: " + e)); } catch (Exception ignored) { } }
                }, new SessionDescription(SessionDescription.Type.ANSWER, d.optString("sdp")));
            }
            JSONObject c = o.optJSONObject("ice");
            if (c != null && c.optString("candidate", "").length() > 0) {
                IceCandidate ic = new IceCandidate(c.optString("sdpMid", "0"), c.optInt("sdpMLineIndex", 0), c.optString("candidate"));
                if (haveAnswer) pc.addIceCandidate(ic); else early.add(ic);
            }
            if (o.has("kbps") && pc != null) for (RtpSender s : pc.getSenders()) if (s.track() != null && "video".equals(s.track().kind())) limit(s, Math.max(500, Math.min(12000, o.optInt("kbps"))));
        } catch (Exception e) { emitErr(e); }
    }

    /* ---------- the sound of the apps on screen, in place of the microphone ---------- */
    long onAudio(ByteBuffer buf, int format, int channels, int rate, int bytes, long ts) {
        try {
            if (appSound == null) {
                MediaProjection mp = cap != null ? cap.getMediaProjection() : null;
                if (mp == null || Build.VERSION.SDK_INT < 29) { zero(buf, bytes); return ts; }
                AudioPlaybackCaptureConfiguration c = new AudioPlaybackCaptureConfiguration.Builder(mp)
                    .addMatchingUsage(AudioAttributes.USAGE_MEDIA).addMatchingUsage(AudioAttributes.USAGE_GAME).addMatchingUsage(AudioAttributes.USAGE_UNKNOWN).build();
                AudioFormat f = new AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(rate)
                    .setChannelMask(channels == 2 ? AudioFormat.CHANNEL_IN_STEREO : AudioFormat.CHANNEL_IN_MONO).build();
                int min = AudioRecord.getMinBufferSize(rate, channels == 2 ? AudioFormat.CHANNEL_IN_STEREO : AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
                appSound = new AudioRecord.Builder().setAudioFormat(f).setBufferSizeInBytes(Math.max(min, bytes * 8)).setAudioPlaybackCaptureConfig(c).build();
                appSound.startRecording();
            }
            // read what has arrived (never wait: this is the audio module's own thread), keep at most 250 ms
            byte[] tmp = new byte[bytes * 2];
            int n = appSound.read(tmp, 0, tmp.length, AudioRecord.READ_NON_BLOCKING);
            if (n > 0) {
                if (ringLen + n > ring.length) { int drop = ringLen + n - ring.length; System.arraycopy(ring, drop, ring, 0, ringLen - drop); ringLen -= drop; }
                System.arraycopy(tmp, 0, ring, ringLen, n); ringLen += n;
            }
            buf.clear();
            int give = Math.min(bytes, ringLen) & ~3;
            buf.put(ring, 0, give);
            for (int i = give; i < bytes; i++) buf.put((byte) 0);
            System.arraycopy(ring, give, ring, 0, ringLen - give); ringLen -= give;
            buf.rewind();
        } catch (Throwable e) { zero(buf, bytes); }
        return ts;
    }
    static void zero(ByteBuffer b, int n) { b.clear(); for (int i = 0; i < n; i++) b.put((byte) 0); b.rewind(); }

    @Override public void onConfigurationChanged(Configuration c) {
        super.onConfigurationChanged(c);
        // turned sideways: the picture follows the screen
        if (h != null) h.post(() -> { if (cap == null) return; int ow = w, oh = h0; size(); if (ow != w || oh != h0) try { cap.changeCaptureFormat(w, h0, fps); } catch (Throwable ignored) { } });
    }

    void finish() {
        if (stopping) return; stopping = true;
        try { if (cap != null) cap.stopCapture(); } catch (Throwable ignored) { }
        try { if (pc != null) pc.dispose(); } catch (Throwable ignored) { }
        try { if (cap != null) cap.dispose(); } catch (Throwable ignored) { }
        try { if (vsrc != null) vsrc.dispose(); } catch (Throwable ignored) { }
        try { if (asrc != null) asrc.dispose(); } catch (Throwable ignored) { }
        try { if (helper != null) helper.dispose(); } catch (Throwable ignored) { }
        try { if (appSound != null) { appSound.stop(); appSound.release(); } } catch (Throwable ignored) { }
        try { if (factory != null) factory.dispose(); } catch (Throwable ignored) { }
        try { if (adm != null) adm.release(); } catch (Throwable ignored) { }
        try { if (egl != null) egl.release(); } catch (Throwable ignored) { }
        pc = null; cap = null; factory = null; appSound = null;
        emit("stopped");
        live = null;
        try { if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE); else stopForeground(true); } catch (Throwable ignored) { }
        stopSelf();
        if (thread != null) thread.quitSafely();
    }

    @Override public void onDestroy() { if (!stopping && h != null) h.post(this::finish); super.onDestroy(); }

    class Obs implements PeerConnection.Observer {
        @Override public void onSignalingChange(PeerConnection.SignalingState s) { }
        @Override public void onIceConnectionChange(PeerConnection.IceConnectionState s) { }
        @Override public void onConnectionChange(PeerConnection.PeerConnectionState s) {
            try { emit(new JSONObject().put("t", "state").put("s", s.name().toLowerCase(java.util.Locale.US))); } catch (Exception ignored) { }
            // the other screen went away (or closed the picture): stop capturing instead of filming the phone for nobody
            if (s == PeerConnection.PeerConnectionState.FAILED || s == PeerConnection.PeerConnectionState.CLOSED) h.post(MirrorService.this::finish);
            if (s == PeerConnection.PeerConnectionState.DISCONNECTED) h.postDelayed(() -> { if (pc != null && pc.connectionState() == PeerConnection.PeerConnectionState.DISCONNECTED) finish(); }, 15000);
        }
        @Override public void onIceConnectionReceivingChange(boolean b) { }
        @Override public void onIceGatheringChange(PeerConnection.IceGatheringState s) { }
        @Override public void onIceCandidate(IceCandidate c) {
            try { emit(new JSONObject().put("t", "ice").put("ice", new JSONObject().put("candidate", c.sdp).put("sdpMid", c.sdpMid).put("sdpMLineIndex", c.sdpMLineIndex))); } catch (Exception ignored) { }
        }
        @Override public void onIceCandidatesRemoved(IceCandidate[] c) { }
        @Override public void onAddStream(org.webrtc.MediaStream m) { }
        @Override public void onRemoveStream(org.webrtc.MediaStream m) { }
        @Override public void onDataChannel(org.webrtc.DataChannel d) { }
        @Override public void onRenegotiationNeeded() { }
    }
    static class Sdp implements SdpObserver {
        @Override public void onCreateSuccess(SessionDescription d) { }
        @Override public void onSetSuccess() { }
        @Override public void onCreateFailure(String e) { emitErr(new Exception(e)); }
        @Override public void onSetFailure(String e) { emitErr(new Exception(e)); }
    }
}
