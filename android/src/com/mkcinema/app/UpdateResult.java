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
            if (!silent) MainActivity.toPage("window.toast&&toast('The update did not install. Try again','err',6000)");
        }
    }

    @SuppressWarnings("deprecation")
    static Intent legacy(Intent i) { return i.getParcelableExtra(Intent.EXTRA_INTENT); }
}
