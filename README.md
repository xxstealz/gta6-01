[![gta6-01](https://make.fun/badge/gta6-01)](https://make.fun/c/gta6-01) [![bounty](https://make.fun/badge/bounty/gta6-01)](https://make.fun/c/gta6-01)

# Solmar Bay — Open World Crime 3D

Rico Solano pulang ke Solmar Bay dengan utang dan satu rencana: lima pekerjaan, satu pelarian terakhir. Jelajahi kota 3D jalan kaki atau naik mobil, curi mobil, kabur dari polisi, dan selesaikan semua misi — kamera third-person di belakang Rico, seperti GTA San Andreas, di kota pantai neon pastel ala Vice City.

## Main

Buka `game/index.html` lewat server statis apa pun (mis. `node serve.ts` lalu http://localhost:8080). Tanpa network, tanpa build step. Three.js r128 di-vendor lokal di `game/vendor/three.min.js`.

- **WASD** bergerak / mengemudi (relatif kamera), **Shift** lari, **E** masuk/keluar mobil, **F** pukul, **klik mouse** menembak (crosshair tengah), **drag mouse** memutar kamera, **Spasi** rem tangan, **P** jeda, **M** suara.
- Kota Solmar Bay 3D: jalan, blok bangunan bertingkat dengan fasad prosedural, taman, pantai + laut, marina dengan perahu, hotel, bandara dengan pesawat — traffic dan pejalan kaki hidup di jalanan.
- Wanted level 0–5 bintang: polisi mengejar dengan mobil dan jalan kaki (lampu merah-biru berkedip), wanted turun kalau kamu bersembunyi. Dari 3 bintang, helikopter polisi mengikutimu dengan sorot lampu.
- **Siklus siang–malam**: waktu berjalan (jam di HUD), senja golden-hour, malam hari jendela menyala + lampu mobil menyala, polisi lebih agresif dan wanted lebih lama hilang di malam hari. Neon sign + pohon palem bikin Solmar Bay beda dari kota lain.
- 5 misi cerita berurutan + uang jalanan, taksi, dan pickup kesehatan/amunisi. Save otomatis di browser (localStorage).
- HUD lengkap: uang, nyawa, bintang wanted, amunisi, kecepatan, objektif misi, dan minimap kota.

## Struktur

- `game/src/config.js` — semua angka, warna, dan daftar misi
- `game/src/city.js` — rencana kota Solmar Bay (jalan, bangunan, taman, pantai)
- `game/src/render3d.js` — scene Three.js: kota, kamera third-person, siang-malam, semua aktor
- `game/src/vehicles.js` — fisika mobil + AI traffic
- `game/src/pedestrians.js` — pejalan kaki + penembak musuh + peluru
- `game/src/police.js` — wanted level + polisi + helikopter
- `game/src/missions.js` — misi cerita + aktivitas sampingan
- `game/src/combat.js` — pukul, tembak, masuk/curi mobil
- `game/src/input.js` — keyboard + mouse (drag orbit, klik tembak)
- `game/src/hud.js` — HUD dan layar menu
- `game/src/minimap.js` — minimap
- `game/src/audio.js` — semua suara disintesis WebAudio
- `game/src/save.js` — save/load localStorage
- `game/src/shots.js` — staging screenshot (`?shot=start|chase|mission|city`)
- `game/src/main.js` — loop utama game
- `game/vendor/three.min.js` — Three.js r128 (MIT), di-vendor lokal

Semua kota, karakter, kendaraan, nama, cerita, dan suara adalah karya original — tanpa aset game komersial.
