# Sample sounds (testing)

Replace these anytime. All listed sources are **CC0** (free for any use, no attribution required).

| File | Use in project | Source |
|---|---|---|
| `fight_bell.wav` | `--style arcade_fight` intro bell | [OpenGameArt — Boxing Ring / boxing_matchbell.wav](https://opengameart.org/content/boxing-ring-0) (Umplix, CC0) |
| `impact_01.wav` | Default hit SFX | [OpenGameArt — Punch SFX / punch_1.wav](https://opengameart.org/content/punch-sfx) (CC0) |
| `impact_02.wav` | Alternate hit | Same pack, `punch_2.wav` |
| `impact_03.wav` | Alternate hit | Same pack, `punch_3.wav` |
| `boxing_bell_short.mp3` | Extra bell (not wired by default) | [BigSoundBank — Boxing bell #3](https://bigsoundbank.com/boxing-bell-3-s1928.html) (CC0) — convert to WAV if you prefer |

Configured paths in `configs/styles/arcade_fight.yaml`:

```yaml
sfx:
  intro_sound: "assets/sounds/fight_bell.wav"
  hit_sound: "assets/sounds/impact_01.wav"
```

Test (bell only by default):

```bash
./run.sh
AUTO_HIT_SFX=1 ./run.sh          # opt-in impact SFX
HIT_TIMES="1.0,2.5,4.0" ./run.sh # manual impact timestamps
```
