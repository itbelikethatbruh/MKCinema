# TV sender tests (Android app 1.12.0 AirPlay, 1.12.1 Chromecast and DLNA)

Checks `android/src/com/mkcinema/app/AirPlay.java` on a computer, without an Apple TV or Android SDK.

```sh
pip install pyatv            # gives cryptography + srptools for the simulated TV
cd tools/airplay-test
cp ../../android/src/com/mkcinema/app/{AirPlay,Cast,Dlna,Json}.java com/mkcinema/app/
javac -d out com/mkcinema/app/*.java
java -cp out com.mkcinema.app.CryptoTest                      # X25519, Ed25519, ChaCha20-Poly1305 against the JDK; plist
python3 fake_atv.py 7701 &                                     # simulated AirPlay 2 Apple TV, code 1234
java -cp out com.mkcinema.app.SessionTest 7701 0000,1234       # wrong code, then the right one; play, pause, seek, end
java -cp out com.mkcinema.app.SessionTest 7701 none <CREDS>    # saved pairing (CREDS printed by the run above)
TRANSIENT=1 python3 fake_atv.py 7702 & java -cp out com.mkcinema.app.SessionTest 7702 none   # no-code pairing
python3 fake_cast.py 18009 &  java -cp out com.mkcinema.app.CastDlnaTest cast 18009        # Chromecast: launch, LOAD, pause, seek, end
java -cp out com.mkcinema.app.CastDlnaTest cast 18009 stop                                   # Stop from the phone
python3 fake_dlna.py 18080 &  java -cp out com.mkcinema.app.CastDlnaTest dlna 18080        # DLNA: SSDP, description, SOAP, end
```
The simulated TV checks the pairing proofs and signatures, the encrypted control and event channels, the timing reply,
SETUP/RECORD/play/rate/scrub, and ends the film after a few polls. A real Apple TV can still differ.
