# Synthetic media fixture

`demo.mp4` is a two-second, silent FFmpeg `testsrc2` pattern generated for SignCast. It depicts no person or avatar and contains **no sign-language interpretation**. The generated pattern may be redistributed with SignCast for testing; no Signvrse assets are included. The UI always labels demo provider output as synthetic demo data.

Reproduce with FFmpeg and libx264:

```text
ffmpeg -f lavfi -i testsrc2=size=960x540:rate=30 -t 2 -an -c:v libx264 -profile:v main -level:v 4.0 -pix_fmt yuv420p -g 15 -movflags +frag_keyframe+empty_moov+default_base_moof fixtures/demo.mp4
```

Real Signvrse output must not be substituted here without redistribution permission. Live smoke-test outputs stay in ignored `artifacts/`.
