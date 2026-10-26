/* MKCinema for Linux: the MKCinema web app in its own window, using WebKitGTK. */
#include <gtk/gtk.h>
#include <webkit2/webkit2.h>
#include <string.h>

#define HOME "https://mkcinema.pages.dev/"
#define HOST "mkcinema.pages.dev"

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

  WebKitWebView *v = WEBKIT_WEB_VIEW(webkit_web_view_new_with_context(ctx));
  WebKitSettings *s = webkit_web_view_get_settings(v);
  webkit_settings_set_media_playback_requires_user_gesture(s, FALSE);
  webkit_settings_set_enable_fullscreen(s, TRUE);
  webkit_settings_set_enable_media_stream(s, TRUE);
  webkit_settings_set_enable_webaudio(s, TRUE);
  webkit_settings_set_javascript_can_open_windows_automatically(s, TRUE);
  webkit_settings_set_hardware_acceleration_policy(s, WEBKIT_HARDWARE_ACCELERATION_POLICY_ALWAYS);
  g_autofree char *ua = g_strconcat(webkit_settings_get_user_agent(s), " MKCinemaLinux/1.0", NULL);
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
  g_object_unref(app);
  return r;
}
