package com.mkcinema.app;
import java.net.InetAddress;
public class SessionTest {
  public static void main(String[] a) throws Exception {
    final AirPlay.Creds[] saved = { a.length > 2 ? AirPlay.Creds.parse(a[2]) : null };
    final String[] pins = a[1].split(",");
    final int[] pi = {0};
    AirPlay.Events ev = new AirPlay.Events() {
      public String askPin(boolean again) { System.out.println("SENDER: asked for code again=" + again); return pi[0] < pins.length ? pins[pi[0]++] : null; }
      public void paired(AirPlay.Creds c) { saved[0] = c; System.out.println("SENDER: paired, creds saved"); }
      public void forget() { System.out.println("SENDER: forget creds"); }
      public void state(String s, double p, double d, String m) { System.out.println("SENDER: " + s + " " + p + "/" + d + (m == null ? "" : " " + m)); }
    };
    AirPlay.Session s = new AirPlay.Session(InetAddress.getByName("127.0.0.1"), Integer.parseInt(a[0]), (a.length>3?a[3]:"0x4A7FDFD5,0xBC157FDE"), "0x244", saved[0], "https://example.com/film.m3u8", 30, ev);
    Thread t = new Thread(s); t.start();
    Thread.sleep(2500); s.command("pause", null); Thread.sleep(1200); s.command("seek", "50"); s.command("play", null);
    t.join(30000);
    System.out.println("CREDS " + saved[0]);
  }
}
