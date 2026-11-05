package com.mkcinema.app;

import android.content.Context;
import android.util.Log;
import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * 1.3.0: the torrent engine (libmkp2p.so, a small Go program built from windows/cmd/mkp2p) for "Play torrent sources
 * on this device". Off until the user turns it on in Settings. It only downloads (no uploading or seeding), keeps one
 * torrent at a time, stops when free storage runs low, and everything it downloaded is deleted when it stops. Closing
 * its input stops it, and that also happens if Android kills the app.
 */
final class P2P {
    private static Process proc;
    private static OutputStream stdin;
    private static String base = "";

    static synchronized String start(Context ctx) {
        if (proc != null && proc.isAlive() && !base.isEmpty()) return base;
        stop(ctx);
        File bin = new File(ctx.getApplicationInfo().nativeLibraryDir, "libmkp2p.so");
        if (!bin.exists()) return "error: the torrent engine is not part of this app build";
        try {
            ProcessBuilder pb = new ProcessBuilder(bin.getPath(), "-dir", ctx.getCacheDir().getPath(), "-keep", "1", "-reserve-mb", "600", "-conns", "30");
            pb.redirectError(ProcessBuilder.Redirect.to(new File("/dev/null")));
            proc = pb.start();
            stdin = proc.getOutputStream();
            final BufferedReader out = new BufferedReader(new InputStreamReader(proc.getInputStream()));
            final ArrayBlockingQueue<String> first = new ArrayBlockingQueue<>(1);
            Thread t = new Thread(() -> {
                try { String l = out.readLine(); first.offer(l == null ? "error: the torrent engine stopped" : l); while (out.readLine() != null) { /* drain */ } }
                catch (Exception e) { first.offer("error: " + e.getMessage()); }
            }, "mkp2p-out");
            t.setDaemon(true); t.start();
            String line = first.poll(15, TimeUnit.SECONDS);
            if (line == null) { stop(ctx); return "error: the torrent engine did not start in time"; }
            if (!line.startsWith("http://127.0.0.1:")) { stop(ctx); return line.startsWith("error") ? line : "error: " + line; }
            base = line.trim();
            return base;
        } catch (Exception e) {
            Log.w("MKCinema", "p2p start", e);
            stop(ctx);
            return "error: " + e.getMessage();
        }
    }

    static synchronized void stop(Context ctx) {
        base = "";
        if (stdin != null) { try { stdin.close(); } catch (Exception ignored) { } stdin = null; }
        if (proc != null) {
            try { if (!proc.waitFor(3, TimeUnit.SECONDS)) proc.destroy(); } catch (Exception e) { proc.destroy(); }
            proc = null;
        }
        rm(new File(ctx.getCacheDir(), "p2p"));
    }

    private static void rm(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) rm(k);
        f.delete();
    }
}
