package com.mkcinema.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.os.Build;

/** 1.13.0: the system package installer's answer to an update MKCinema installed itself (MainActivity.installApk).
    When the system wants the person to confirm, the prompt opens if the app is on screen; after an automatic update
    in the background, the page offers Install the next time the app opens. On success Android restarts nothing:
    the next start is the new version, and the page says it was updated. */
public class UpdateResult extends BroadcastReceiver {
    static volatile boolean ask;

    @Override public void onReceive(Context c, Intent i) {
        int st = i.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        boolean silent = i.getBooleanExtra("silent", false);
        if (st == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = Build.VERSION.SDK_INT >= 33 ? i.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class) : legacy(i);
            MainActivity a = MainActivity.liveAct;
            if (confirm != null && a != null && a.resumed) {
                try { a.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception e) { ask = true; }
            } else ask = true;
            if (silent) MainActivity.autoState = 2;
            return;
        }
        if (st != PackageInstaller.STATUS_SUCCESS) {
            MainActivity.autoState = 0;
            // 1.17.6: say why (Android's own message), on the page and in the app log, instead of nothing
            String msg = i.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
            String why = st == PackageInstaller.STATUS_FAILURE_ABORTED ? "the install was cancelled"
                : st == PackageInstaller.STATUS_FAILURE_STORAGE ? "there is not enough free space to install it"
                : st == PackageInstaller.STATUS_FAILURE_CONFLICT ? "it conflicts with the installed app"
                : st == PackageInstaller.STATUS_FAILURE_INCOMPATIBLE ? "this device cannot install it"
                : st == PackageInstaller.STATUS_FAILURE_BLOCKED ? "the device blocked the install"
                : "Android could not install it";
            MainActivity.updFail(why + (msg != null && !msg.isEmpty() ? " (" + msg + ")" : ""));
        }
    }

    @SuppressWarnings("deprecation")
    static Intent legacy(Intent i) { return i.getParcelableExtra(Intent.EXTRA_INTENT); }
}
