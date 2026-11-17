package com.mkcinema.app;
import java.security.*; import java.security.spec.*; import javax.crypto.*; import javax.crypto.spec.*; import java.util.*; import java.math.BigInteger;
public class CryptoTest {
  static void check(boolean ok, String what) { if (!ok) { System.out.println("FAIL " + what); System.exit(1); } }
  public static void main(String[] a) throws Exception {
    Random r = new Random(1);
    for (int t = 0; t < 20; t++) {
      // X25519 vs JDK
      byte[] s1 = AirPlay.random(32), s2 = AirPlay.random(32);
      byte[] p1 = AirPlay.x25519Base(s1), p2 = AirPlay.x25519Base(s2);
      check(Arrays.equals(AirPlay.x25519(s1, p2), AirPlay.x25519(s2, p1)), "x25519 dh");
      KeyPairGenerator g = KeyPairGenerator.getInstance("X25519"); KeyPair kp = g.generateKeyPair();
      byte[] jpub = Arrays.copyOfRange(kp.getPublic().getEncoded(), 12, 44);
      KeyAgreement ka = KeyAgreement.getInstance("X25519"); ka.init(kp.getPrivate());
      KeyFactory kf = KeyFactory.getInstance("X25519");
      byte[] rev = p1.clone(); for (int i=0;i<16;i++){byte x=rev[i];rev[i]=rev[31-i];rev[31-i]=x;}
      ka.doPhase(kf.generatePublic(new XECPublicKeySpec(NamedParameterSpec.X25519, new BigInteger(1, rev))), true);
      check(Arrays.equals(ka.generateSecret(), AirPlay.x25519(s1, jpub)), "x25519 vs jdk");
      // Ed25519 vs JDK
      byte[] seed = AirPlay.random(32), msg = AirPlay.random(r.nextInt(200));
      byte[] sig = AirPlay.edSign(seed, msg), pub = AirPlay.edPublic(seed);
      KeyFactory ek = KeyFactory.getInstance("Ed25519");
      PrivateKey pk = ek.generatePrivate(new EdECPrivateKeySpec(NamedParameterSpec.ED25519, seed));
      Signature sg = Signature.getInstance("Ed25519"); sg.initSign(pk); sg.update(msg);
      check(Arrays.equals(sg.sign(), sig), "ed25519 sign vs jdk");
      check(AirPlay.edVerify(pub, msg, sig), "ed verify");
      byte[] bad = sig.clone(); bad[5] ^= 1; check(!AirPlay.edVerify(pub, msg, bad), "ed verify bad");
      // chacha20-poly1305 vs JDK
      byte[] key = AirPlay.random(32), nonce = AirPlay.random(12), aad = AirPlay.random(r.nextInt(20)), pt = AirPlay.random(r.nextInt(2000));
      Cipher c = Cipher.getInstance("ChaCha20-Poly1305"); c.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "ChaCha20"), new IvParameterSpec(nonce)); c.updateAAD(aad);
      byte[] jct = c.doFinal(pt);
      check(Arrays.equals(jct, AirPlay.seal(key, nonce, aad, pt)), "chacha vs jdk");
      check(Arrays.equals(pt, AirPlay.open(key, nonce, aad, jct)), "chacha open");
    }
    // plist round trip
    Map<String,Object> m = new LinkedHashMap<>(); m.put("a", 1); m.put("b", 2.5); m.put("c", "héllo"); m.put("d", true); m.put("e", Arrays.asList(1,"x")); m.put("long", "x".repeat(300)); m.put("data", new byte[]{1,2,3});
    Object back = AirPlay.plistRead(AirPlay.plist(m));
    System.out.println(back);
    
    long t0 = System.nanoTime(); for (int i=0;i<10;i++) AirPlay.edSign(AirPlay.random(32), new byte[100]); System.out.println("sign ms " + (System.nanoTime()-t0)/1e7);
    System.out.println("crypto OK");
  }
}
