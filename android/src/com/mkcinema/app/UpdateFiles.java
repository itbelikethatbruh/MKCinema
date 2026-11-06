package com.mkcinema.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;

/** 1.8.1: hands the checked update APK, kept in the app's private storage, to the system installer.
    Read-only, one file, not exported: the installer gets access only through the one-time grant on the install intent. */
public class UpdateFiles extends ContentProvider {
    static File file(Context c) { return new File(new File(c.getCacheDir(), "update"), MainActivity.UPD_FILE); }

    boolean ours(Uri u) { return u != null && ("/" + MainActivity.UPD_FILE).equals(u.getPath()); }

    @Override public boolean onCreate() { return true; }

    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!ours(uri) || mode == null || mode.contains("w")) throw new FileNotFoundException();
        return ParcelFileDescriptor.open(file(getContext()), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override public String getType(Uri uri) { return ours(uri) ? "application/vnd.android.package-archive" : null; }

    @Override public Cursor query(Uri uri, String[] proj, String sel, String[] args, String sort) {
        if (!ours(uri)) return null;
        MatrixCursor c = new MatrixCursor(new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE });
        c.addRow(new Object[] { MainActivity.UPD_FILE, file(getContext()).length() });
        return c;
    }

    @Override public Uri insert(Uri uri, ContentValues v) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String s, String[] a) { return 0; }
    @Override public int update(Uri uri, ContentValues v, String s, String[] a) { return 0; }
}
