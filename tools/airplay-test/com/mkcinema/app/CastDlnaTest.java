package com.mkcinema.app;
import java.net.InetAddress;
/** java CastDlnaTest cast PORT  |  java CastDlnaTest dlna PORT  (runs against fake_cast.py / fake_dlna.py) */
public class CastDlnaTest {
  public static void main(String[] a) throws Exception {
    AirPlay.Events ev = new AirPlay.Events() {
      public String askPin(boolean again) { return null; }
      public void paired(AirPlay.Creds c) { }
      public void forget() { }
      String last = "";
      public void state(String s, double p, double d, String m) { String k = s + (m == null ? "" : m); if (!k.equals(last)) System.out.println("SENDER: " + s + " " + Math.round(p) + "/" + Math.round(d) + (m == null ? "" : " " + m)); last = k; }
    };
    int port = Integer.parseInt(a[1]);
    AirPlay.Player s;
    if ("cast".equals(a[0])) s = new Cast.Session(InetAddress.getByName("127.0.0.1"), port, "https://example.com/film.mkv?x=1&y=2", "Heat \"1995\"", 4, ev);
    else {
      Dlna.discover(3000, r -> System.out.println("SENDER: found by SSDP " + r.name + " / " + r.model + " " + r.control));
      Dlna.Renderer r = Dlna.describe("http://127.0.0.1:" + port + "/desc.xml");
      System.out.println("SENDER: described " + r.name + " / " + r.model + " / " + r.udn + " / " + r.control);
      s = new Dlna.Session(r.control, "https://example.com/film.mp4?x=1&y=2", "Heat <1995>", 4, ev);
    }
    Thread t = new Thread(s); t.start();
    Thread.sleep(3000); s.command("pause", null); Thread.sleep(2000); s.command("seek", "10"); s.command("play", null);
    if (a.length > 2) { Thread.sleep(1500); s.stop(); }
    t.join(40000);
    System.out.println("SENDER: done, thread alive=" + t.isAlive());
  }
}
