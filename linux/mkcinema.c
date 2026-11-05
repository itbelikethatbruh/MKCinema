/* MKCinema for Linux: the MKCinema web app in its own window, using WebKitGTK. */
#include <gtk/gtk.h>
#include <webkit2/webkit2.h>
#include <string.h>

#define HOME "https://mkcinema.pages.dev/"
#define HOST "mkcinema.pages.dev"
#define VERSION "1.1"

/* ---- Torrents on this computer (window.MKDesktop.p2p) ----
   The torrent engine is the separate mkp2p program shipped next to this one. It only downloads (never uploads or
   seeds), listens on 127.0.0.1 with a random token, and deletes what it downloaded when it stops. It stops when we
   close its input, which also happens when this app quits or crashes. The web app turns it on only after the user
   agrees in Settings. */
static GSubprocess *eng;
static GDataInputStream *eng_out;
static char *eng_base;
static GPtrArray *eng_waiting; /* WebKitScriptMessageReply* waiting for the first start */

static char *engine_path(void) {
  g_autofree char *exe = g_file_read_link("/proc/self/exe", NULL);
  if (!exe) return NULL;
  g_autofree char *dir = g_path_get_dirname(exe);
  const char *rel[] = {"mkp2p", "../lib/mkcinema/mkp2p", NULL};
  for (int i = 0; rel[i]; i++) {
    char *p = g_build_filename(dir, rel[i], NULL);
    if (g_file_test(p, G_FILE_TEST_IS_EXECUTABLE)) return p;
    g_free(p);
  }
  return NULL;
}

static void reply_all(const char *base, const char *err) {
  for (guint i = 0; eng_waiting && i < eng_waiting->len; i++) {
    WebKitScriptMessageReply *r = g_ptr_array_index(eng_waiting, i);
    if (base) {
      g_autoptr(JSCContext) c = jsc_context_new();
      g_autoptr(JSCValue) v = jsc_value_new_string(c, base);
      webkit_script_message_reply_return_value(r, v);
    } else webkit_script_message_reply_return_error_message(r, err ? err : "the engine did not start");
  }
  if (eng_waiting) g_ptr_array_set_size(eng_waiting, 0);
}

static void engine_stop(void) {
  if (eng) {
    g_output_stream_close(g_subprocess_get_stdin_pipe(eng), NULL, NULL); /* engine deletes its files and exits */
    g_subprocess_wait_async(eng, NULL, NULL, NULL);
    g_clear_object(&eng);
  }
  g_clear_object(&eng_out);
  g_clear_pointer(&eng_base, g_free);
  reply_all(NULL, "the engine stopped");
}

static void engine_line(GObject *src, GAsyncResult *res, gpointer proc) {
  gsize n = 0;
  g_autoptr(GError) e = NULL;
  g_autofree char *line = g_data_input_stream_read_line_finish(G_DATA_INPUT_STREAM(src), res, &n, &e);
  if (proc != eng) return; /* stopped meanwhile */
  if (line && g_str_has_prefix(line, "http://127.0.0.1:")) {
    eng_base = g_strdup(g_strstrip(line));
    reply_all(eng_base, NULL);
    return;
  }
  g_autofree char *msg = g_strdup(line && *line ? (g_str_has_prefix(line, "error: ") ? line + 7 : line) : (e ? e->message : "the engine closed"));
  g_warning("p2p: %s", msg);
  reply_all(NULL, msg);
  engine_stop();
}

static void engine_start(WebKitScriptMessageReply *r) {
  if (eng_base) {
    g_autoptr(JSCContext) c = jsc_context_new();
    g_autoptr(JSCValue) v = jsc_value_new_string(c, eng_base);
    webkit_script_message_reply_return_value(r, v);
    return;
  }
  if (!eng_waiting) eng_waiting = g_ptr_array_new_with_free_func((GDestroyNotify)webkit_script_message_reply_unref);
  g_ptr_array_add(eng_waiting, webkit_script_message_reply_ref(r));
  if (eng) return; /* already starting */
  g_autofree char *bin = engine_path();
  if (!bin) { reply_all(NULL, "the torrent engine is missing from this install"); return; }
  g_autofree char *cache = g_build_filename(g_get_user_cache_dir(), "mkcinema", NULL);
  g_mkdir_with_parents(cache, 0700);
  g_autoptr(GError) e = NULL;
  eng = g_subprocess_new(G_SUBPROCESS_FLAGS_STDIN_PIPE | G_SUBPROCESS_FLAGS_STDOUT_PIPE, &e,
                         bin, "-dir", cache, "-keep", "2", "-reserve-mb", "1024", "-conns", "50", NULL);
  if (!eng) { reply_all(NULL, e->message); return; }
  eng_out = g_data_input_stream_new(g_subprocess_get_stdout_pipe(eng));
  g_data_input_stream_read_line_async(eng_out, G_PRIORITY_DEFAULT, NULL, engine_line, eng);
}

/* window.webkit.messageHandlers.mkd.postMessage('p2p-start' | 'p2p-stop') returns a promise */
static gboolean on_desktop(WebKitUserContentManager *m, JSCValue *msg, WebKitScriptMessageReply *r, gpointer x) {
  g_autofree char *cmd = jsc_value_is_string(msg) ? jsc_value_to_string(msg) : NULL;
  if (!g_strcmp0(cmd, "p2p-start")) { engine_start(r); return TRUE; }
  if (!g_strcmp0(cmd, "p2p-stop")) engine_stop();
  g_autoptr(JSCContext) c = jsc_context_new();
  g_autoptr(JSCValue) v = jsc_value_new_null(c);
  webkit_script_message_reply_return_value(r, v);
  return TRUE;
}

static void add_desktop(WebKitUserContentManager *m) {
  g_autofree char *bin = engine_path();
  g_autofree char *js = g_strdup_printf(
    "(function(){if(location.hostname!=='" HOST "')return;var h=window.webkit.messageHandlers.mkd;"
    "var d={platform:'linux',version:'" VERSION "'};"
    "%s window.MKDesktop=d;})();",
    bin ? "d.p2p={start:function(){return h.postMessage('p2p-start')},stop:function(){return h.postMessage('p2p-stop')}};" : "");
  WebKitUserScript *s = webkit_user_script_new(js, WEBKIT_USER_CONTENT_INJECT_TOP_FRAME, WEBKIT_USER_SCRIPT_INJECT_AT_DOCUMENT_START, NULL, NULL);
  webkit_user_content_manager_add_script(m, s);
  webkit_user_script_unref(s);
  g_signal_connect(m, "script-message-with-reply-received::mkd", G_CALLBACK(on_desktop), NULL);
  webkit_user_content_manager_register_script_message_handler_with_reply(m, "mkd", NULL);
}

static void open_external(const char *uri) {
  GError *e = NULL;
  if (!g_app_info_launch_default_for_uri(uri, NULL, &e)) { g_warning("open %s: %s", uri, e->message); g_clear_error(&e); }
}

static gboolean is_ours(const char *uri) {
  g_autoptr(GUri) u = g_uri_parse(uri, G_URI_FLAGS_NONE, NULL);
  if (!u) return FALSE;
  const char *s = g_uri_get_scheme(u), *h = g_uri_get_host(u);
  if (!g_strcmp0(s, "about") || !g_strcmp0(s, "blob") || !g_strcmp0(s, "data")) return TRUE;
  return (!g_strcmp0(s, "https") || !g_strcmp0(s, "http")) && h && !strcmp(h, HOST);
}

/* MKCinema pages stay in the window; players (vlc:// and similar), stores and other sites open in their own apps. */
static gboolean on_policy(WebKitWebView *v, WebKitPolicyDecision *d, WebKitPolicyDecisionType t, gpointer x) {
  if (t != WEBKIT_POLICY_DECISION_TYPE_NAVIGATION_ACTION && t != WEBKIT_POLICY_DECISION_TYPE_NEW_WINDOW_ACTION) return FALSE;
  WebKitNavigationAction *a = webkit_navigation_policy_decision_get_navigation_action(WEBKIT_NAVIGATION_POLICY_DECISION(d));
  const char *uri = webkit_uri_request_get_uri(webkit_navigation_action_get_request(a));
  if (!uri) return FALSE;
  gboolean web = g_str_has_prefix(uri, "http:") || g_str_has_prefix(uri, "https:");
  if (t == WEBKIT_POLICY_DECISION_TYPE_NEW_WINDOW_ACTION || !web) {
    if (is_ours(uri) && t == WEBKIT_POLICY_DECISION_TYPE_NEW_WINDOW_ACTION) webkit_web_view_load_uri(v, uri);
    else if (!is_ours(uri)) open_external(uri);
    webkit_policy_decision_ignore(d);
    return TRUE;
  }
  return FALSE;
}

static gboolean on_permission(WebKitWebView *v, WebKitPermissionRequest *r, gpointer x) {
  if (WEBKIT_IS_USER_MEDIA_PERMISSION_REQUEST(r) && webkit_user_media_permission_is_for_audio_device(WEBKIT_USER_MEDIA_PERMISSION_REQUEST(r))
      && !webkit_user_media_permission_is_for_video_device(WEBKIT_USER_MEDIA_PERMISSION_REQUEST(r))) webkit_permission_request_allow(r);
  else if (WEBKIT_IS_NOTIFICATION_PERMISSION_REQUEST(r) || WEBKIT_IS_USER_MEDIA_PERMISSION_REQUEST(r)) webkit_permission_request_deny(r);
  else return FALSE;
  return TRUE;
}

static gboolean on_failed(WebKitWebView *v, WebKitLoadEvent ev, char *uri, GError *e, gpointer x) {
  if (g_error_matches(e, WEBKIT_NETWORK_ERROR, WEBKIT_NETWORK_ERROR_CANCELLED) || g_error_matches(e, WEBKIT_POLICY_ERROR, WEBKIT_POLICY_ERROR_FRAME_LOAD_INTERRUPTED_BY_POLICY_CHANGE)) return FALSE;
  webkit_web_view_load_alternate_html(v,
    "<!doctype html><body style='margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#f2f2f3;font:16px system-ui;text-align:center'>"
    "<div><div style='font:500 32px Georgia,serif;margin-bottom:10px'>You're offline</div>"
    "<div style='color:#bdbdc5;margin-bottom:26px'>MKCinema needs a connection to load. Check your network, then try again.</div>"
    "<a href='" HOME "' style='display:inline-block;padding:14px 26px;border-radius:999px;background:#e9e6de;color:#0b0b0c;font-weight:600;text-decoration:none'>Try again</a></div>",
    uri, NULL);
  return TRUE;
}

static gboolean on_key(GtkWidget *w, GdkEventKey *k, WebKitWebView *v) {
  if ((k->state & GDK_CONTROL_MASK) && k->keyval == GDK_KEY_q) { gtk_widget_destroy(w); return TRUE; }
  if (k->keyval == GDK_KEY_F5 || ((k->state & GDK_CONTROL_MASK) && k->keyval == GDK_KEY_r)) { webkit_web_view_reload(v); return TRUE; }
  if ((k->state & GDK_MOD1_MASK) && k->keyval == GDK_KEY_Left && webkit_web_view_can_go_back(v)) { webkit_web_view_go_back(v); return TRUE; }
  return FALSE;
}

static void activate(GtkApplication *app, gpointer x) {
  GList *ws = gtk_application_get_windows(app);
  if (ws) { gtk_window_present(GTK_WINDOW(ws->data)); return; }
  g_autofree char *data = g_build_filename(g_get_user_data_dir(), "mkcinema", NULL);
  g_autofree char *cache = g_build_filename(g_get_user_cache_dir(), "mkcinema", NULL);
  g_autofree char *cookies = g_build_filename(data, "cookies.sqlite", NULL);
  WebKitWebsiteDataManager *dm = webkit_website_data_manager_new("base-data-directory", data, "base-cache-directory", cache, NULL);
  WebKitWebContext *ctx = webkit_web_context_new_with_website_data_manager(dm);
  WebKitCookieManager *cm = webkit_web_context_get_cookie_manager(ctx);
  g_mkdir_with_parents(data, 0700);
  webkit_cookie_manager_set_persistent_storage(cm, cookies, WEBKIT_COOKIE_PERSISTENT_STORAGE_SQLITE);
  webkit_cookie_manager_set_accept_policy(cm, WEBKIT_COOKIE_POLICY_ACCEPT_ALWAYS);

  WebKitUserContentManager *ucm = webkit_user_content_manager_new();
  add_desktop(ucm);
  WebKitWebView *v = WEBKIT_WEB_VIEW(g_object_new(WEBKIT_TYPE_WEB_VIEW, "web-context", ctx, "user-content-manager", ucm, NULL));
  WebKitSettings *s = webkit_web_view_get_settings(v);
  webkit_settings_set_media_playback_requires_user_gesture(s, FALSE);
  webkit_settings_set_enable_fullscreen(s, TRUE);
  webkit_settings_set_enable_media_stream(s, TRUE);
  webkit_settings_set_enable_webaudio(s, TRUE);
  webkit_settings_set_javascript_can_open_windows_automatically(s, TRUE);
  webkit_settings_set_hardware_acceleration_policy(s, WEBKIT_HARDWARE_ACCELERATION_POLICY_ALWAYS);
  g_autofree char *ua = g_strconcat(webkit_settings_get_user_agent(s), " MKCinemaLinux/" VERSION, NULL);
  webkit_settings_set_user_agent(s, ua);
  GdkRGBA black = {0, 0, 0, 1};
  webkit_web_view_set_background_color(v, &black);

  GtkWidget *win = gtk_application_window_new(app);
  gtk_window_set_title(GTK_WINDOW(win), "MKCinema");
  gtk_window_set_default_size(GTK_WINDOW(win), 1440, 900);
  gtk_window_set_icon_name(GTK_WINDOW(win), "mkcinema");
  gtk_container_add(GTK_CONTAINER(win), GTK_WIDGET(v));
  g_signal_connect(v, "decide-policy", G_CALLBACK(on_policy), NULL);
  g_signal_connect(v, "permission-request", G_CALLBACK(on_permission), NULL);
  g_signal_connect(v, "load-failed", G_CALLBACK(on_failed), NULL);
  g_signal_connect(win, "key-press-event", G_CALLBACK(on_key), v);
  webkit_web_view_load_uri(v, HOME);
  gtk_widget_show_all(win);
}

int main(int argc, char **argv) {
  g_set_prgname("mkcinema");
  GtkApplication *app = gtk_application_new("dev.pages.mkcinema", G_APPLICATION_DEFAULT_FLAGS);
  g_signal_connect(app, "activate", G_CALLBACK(activate), NULL);
  int r = g_application_run(G_APPLICATION(app), argc, argv);
  engine_stop();
  g_object_unref(app);
  return r;
}
