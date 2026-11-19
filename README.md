# COSMICLABS Make.fun Command Center

**Bahasa Indonesia** · [English](README.en.md)

Gunakan dasbor lokal ini untuk mencari bounty make.fun dan memeriksa persyaratan resminya. Ekspor konteks bounty ke MUSE BOUNTY AGENT, lalu gunakan dasbor untuk melacak bukti eksekusi, submission, dan hadiah.

## <img src="docs/icons/install.svg" alt="" width="20" height="20"> Instalasi dan cara menjalankan

Bun mengelola dependensi. Server Express dan driver SQLite native berjalan di Node.js. Aplikasi ini diuji di Windows dengan Bun 1.4.2 dan Node.js 24.22.1.

~~~sh
git clone https://github.com/yusufwardana/makefun.md.git
cd makefun.md
bun install --frozen-lockfile
bun run dev
~~~

Buka [dasbor lokal](http://127.0.0.1:3000). Secara default, server hanya menerima koneksi dari mesin yang sama. Untuk mengubah konfigurasi, salin `.env.example` ke `.env`.

Atur `COMMAND_CENTER_TOKEN` untuk melindungi operasi API yang mengubah data dan unduhan paket Muse. Masukkan token di **Settings** untuk sesi browser yang sedang aktif. Jika dasbor diakses dari mesin lain, lindungi seluruh aplikasi dengan reverse proxy yang mewajibkan autentikasi, termasuk untuk akses baca.

~~~powershell
bun run lint
bun run build
bun x --no-install tsx --test 'tests/*.test.ts'
~~~

Untuk produksi, jalankan build lalu jalankan `bun run start` dengan `NODE_ENV=production`. Server akan menyajikan hasil build dasbor.

## <img src="docs/icons/workspace.svg" alt="" width="20" height="20"> Menyiapkan MUSE BOUNTY AGENT di Muse.ai Cloud

Unduh [ZIP workspace Phase 1](docs/muse-bounty-agent.zip). Arsip ini berisi panduan workspace, prompt untuk menyiapkan dan memulai sesi, delapan skill awal, serta alat pemeriksaan offline.

1. Untuk workspace baru, buka **MUSE BOUNTY AGENT** di Muse.ai Cloud dan lampirkan ZIP. Minta Muse mengikuti `MUSE_APP_SETUP_PROMPT.md` di dalam arsip, lalu melaporkan lokasi workspace dan berkas yang bisa dibaca.
2. Jika workspace sudah ada, buka workspace itu dan ikuti `AGENTS.md` serta `MUSE_START_PROMPT.md`. Gunakan berkas dan Skill Registry yang sudah ada.
3. Untuk workspace Phase 2, cek daftar skill tambahan di registry (`react-best-practices`, `build-wiring-readback-audit`, `verify-summaries`, dan `design-system-audit`). Minta Muse membuka setiap `SKILL.md` yang relevan dan menyebutkan berkas yang benar-benar dibaca di sesi aktif.

## <img src="docs/icons/handoff.svg" alt="" width="20" height="20"> Menjalankan handoff bounty

1. Jalankan sinkronisasi di **Bounty Explorer**. Cari, bandingkan, atau masukkan kompetisi ke watchlist. Buka detail bounty untuk memeriksa prasyarat dan selisih skor di leaderboard.
2. Pilih **Inspect requirements & export** untuk melihat prompt resmi, aturan, hasil yang harus diserahkan, kriteria penilaian, jadwal pembayaran, manifest Competition Kit, dan leaderboard publik.
3. Di **Export to Muse**, unduh JSON atau Markdown dan salin instruksi bootstrap. Lampirkan paket di workspace **MUSE BOUNTY AGENT** atau minta Muse membacanya dari berkas yang tersedia. Minta Muse mengikuti bootstrap, memakai instruksi workspace dan Skill Registry, lalu mencocokkan isi paket dengan persyaratan resmi.

Untuk uji handoff, cukup minta laporan validasi, skill yang dimuat, informasi yang kurang, dan kesiapan eksekusi. Mulai build atau submission setelah mendapat persetujuan terpisah. Siapkan perekaman sesi resmi sebelum implementasi jika diwajibkan.

Gunakan **Evidence Monitor** untuk memeriksa bukti dari sesi aktif. Dasbor menjalankan sembilan pemeriksaan awal terhadap transkrip. make.fun menangani validasi resmi. Gunakan **Submissions** untuk melacak bukti penerimaan dan **Rewards Analytics** untuk melihat hadiah yang diumumkan, diberikan, dan diterima.

Dasbor mengambil data dengan permintaan GET ke endpoint publik make.fun. Build, pendaftaran, submission, dan transaksi berlangsung di luar dasbor. Kamu bisa menjalankan Command Center tanpa akun LLM.

## <img src="docs/icons/freshness.svg" alt="" width="20" height="20"> Status sumber data

| Indikator | Arti |
| --- | --- |
| LIVE | Snapshot detail resmi berisi prompt asli dan persyaratan yang cocok, serta berumur paling lama enam jam. |
| STALE | Snapshot detail resmi berisi prompt dan persyaratan yang cocok, tetapi umurnya lebih dari enam jam. |
| OFFLINE | Sinkronisasi terakhir menandai bounty sebagai offline. Data resmi yang tersimpan di cache tetap bisa dilihat. |
| UNVERIFIED | Detail, prompt, persyaratan yang cocok, atau waktu pengambilan yang valid belum lengkap. |

Di Bounty Intelligence, lihat sumber, waktu pengambilan snapshot, dan waktu sinkronisasi terakhir bounty. Snapshot baru bisa saja belum memuat manifest kit atau leaderboard. Dasbor menandai data yang belum tersedia agar Muse bisa memeriksanya di halaman resmi. Untuk memeriksa prasyarat atau membandingkan akun yang dipantau dengan leaderboard, gunakan Explorer.

## <img src="docs/icons/package-schema.svg" alt="" width="20" height="20"> Kontrak paket Muse

- [JSON Schema v1.0.0](docs/muse-execution-package.schema.json) dan [contoh JSON sintetis](docs/muse-execution-package.example.json)
- [Contoh MUSE_BOUNTY_CONTEXT.md dan bootstrap](docs/MUSE_BOUNTY_CONTEXT.md)

Server memvalidasi setiap ekspor JSON terhadap skema. Paket memuat data terpilih dari snapshot kompetisi, persyaratan, kit, dan leaderboard publik. Server menyalin deskripsi resmi sebagai prompt, termasuk spasi dan baris baru. Override prompt manual, catatan operator, analisis lama, bukti, kredensial, dan pengaturan privat tetap di luar paket.

Nilai `null` berarti data belum tersedia. Daftar kosong berarti sumber menyediakan daftar tanpa entri yang bisa dipakai. Untuk pemeriksaan resmi, `true` berarti berlaku, `false` berarti tidak berlaku, dan `null` berarti sumber tidak menyebutkannya. Periksa kembali persyaratan yang belum jelas di Muse sebelum eksekusi.

`createdAt` menyimpan waktu pengambilan snapshot resmi dan bernilai `null` jika snapshot tepercaya belum tersedia. Server menghitung ID snapshot dari objek mentah sumber resmi yang cocok dan URL sumber kompetisi.

ID paket dan checksum memakai hash yang sama. Inputnya mencakup field tingkat atas dari `bounty` hingga `submissionRequirements`, empat URL dari `sourceProvenance` yang disalin ke tingkat atas, dan `missingInformation`. Waktu dan status kesegaran berada di luar input hash paket. Untuk kedua hash, server memakai JSON UTF-8 ringkas, mengurutkan key objek secara rekursif, mempertahankan urutan array, dan memakai serialisasi angka serta string JavaScript. Gunakan checksum untuk memeriksa isi paket. make.fun memverifikasi penerimaan resmi.

Unduh paket melalui `GET /api/bounties/:slug/muse-export` dengan `format=json` atau `format=markdown`. Endpoint hanya membaca snapshot dari SQLite lokal dan mengirim lampiran dengan nama berkas tetap. Jika permintaan menyertakan checksum opsional dari tampilan detail dan konten sudah berubah, server mengembalikan HTTP 409. Gunakan refresh untuk mengambil sumber terbaru.

Server membatasi tautan sumber ke origin resmi make.fun. Pagar kode dalam ekspor Markdown membuat markup eksternal tampil sebagai teks.

## <img src="docs/icons/database.svg" alt="" width="20" height="20"> Data SQLite

Database default ada di `data/cosmiclabs.db`. Atur `COSMICLABS_DB_PATH` untuk memilih database yang sudah ada atau memakai berkas uji terpisah. Aplikasi mempertahankan skema SQLite dan menyimpan arsip `ai_analyses`, `prompt_drafts`, `prompt_versions`, override prompt lama, dan pengaturan provider lama di tempatnya. Bukti tetap memakai tabel `hermes_evidence`.

Aplikasi mempertahankan berkas `.env` yang sudah ada. Setelah alur enhancement dihapus, aplikasi berhenti memuat pengaturan dan rahasia provider lama dari alur tersebut.

Pemindaian bukti hanya membaca direktori yang diizinkan di dalam workspace. Pastikan berkas yang diimpor berasal dari bounty dan sesi yang sedang dikerjakan. Penentuan asal-usul bukti dan penerimaan resmi dilakukan oleh make.fun.

[Audit, daftar perubahan, dan laporan QA](docs/REFRACTOR_QA.md)
