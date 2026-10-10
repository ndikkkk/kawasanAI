# Kawasan AI

Chat pribadi berbasis Next.js dengan dropdown model TokenGateway, avatar lokal, sidebar yang bisa diciutkan, New Brainstorm, ubah/hapus judul riwayat, dan personalisasi nama serta gaya jawaban.

## Menjalankan lokal

1. Salin `E:\web\webchatskripsi\.env.example` ke `E:\web\webchatskripsi\.env.local`.
2. Isi `ACCESS_CODE`, `SESSION_SECRET`, `TOKEN_GATEWAY_BASE_URL`, `TOKEN_GATEWAY_API_KEY`, `SUPABASE_URL`, dan `SUPABASE_SECRET_KEY`. Siapkan database sesuai panduan di bawah.
3. Buat SESSION_SECRET acak minimal 32 karakter dengan `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Jangan commit nilainya.
4. Jalankan `npm install`, lalu `npm run dev` dari `E:\web\webchatskripsi`.
5. Base URL harus sesuai provider; aplikasi menambahkan `/chat/completions` otomatis. Model harus merupakan ID yang diterima provider.

## Vercel dan beberapa kode akses

Import repository `ndikkkk/kawasanAI`, pilih Next.js dan root directory default. Environment yang perlu diisi pada Production (juga Preview jika dipakai):

| Nama | Jenis | Keterangan |
| --- | --- | --- |
| ACCESS_CODE | Secret/Sensitive | Satu atau beberapa kode dipisahkan koma, misalnya `kode-pertama,kode-kedua,kode-ketiga` |
| ACCESS_CODE_2 | Secret/Sensitive | Kompatibilitas lama; dapat dikosongkan/dihapus setelah nilainya dipindah ke ACCESS_CODE |
| SESSION_SECRET | Secret/Sensitive | Wajib, acak minimal 32 karakter; bukan kode login |
| SUPABASE_URL | Config | URL project Supabase, `https://PROJECT.supabase.co` |
| SUPABASE_SECRET_KEY | Secret/Sensitive | Secret key backend `sb_secret_...`; bukan publishable/anon key dan tidak memakai prefix NEXT_PUBLIC_ |
| TOKEN_GATEWAY_API_KEY | Secret/Sensitive | API key dari TokenGateway |
| TOKEN_GATEWAY_BASE_URL | Config | Base URL dari provider, termasuk /v1 jika disyaratkan |
| TOKEN_GATEWAY_MODEL | Config | Opsional: default jika request tidak mengirim model |
| SYSTEM_PROMPT | Config | Opsional: instruksi umum asisten |

Simpan lalu redeploy. Versi ini menolak login jika SESSION_SECRET belum diisi. Cookie lama sengaja tidak berlaku: pengguna perlu login ulang.

Pada halaman login masukkan **salah satu kode**, bukan seluruh daftar. Spasi di awal/akhir diabaikan, entri kosong diabaikan, kode duplikat digabung, dan huruf besar/kecil tetap dibedakan. Koma adalah pemisah, sehingga tidak dapat menjadi bagian dari kode. Menambah/mengurutkan ulang daftar tidak membatalkan session kode yang masih terdaftar; menghapus kode membatalkan session kode tersebut (pastikan juga tidak tersisa di ACCESS_CODE_2).

Semua kode memiliki izin dan kuota provider yang sama, bukan akun dengan saldo terpisah. **Semua pengguna/perangkat berbagi riwayat Supabase yang sama**, meskipun kode login berbeda. Mengganti kode/SESSION_SECRET tidak menghapus riwayat database. Session tetap memiliki subjek per kode agar kode yang dicabut tidak dapat mengakses database melalui aplikasi.

## Membuat project Supabase

1. Buka https://supabase.com/dashboard, masuk/daftar, lalu **New project**. Pilih organisasi, nama `kawasan-ai`, password database yang kuat, dan region dekat pengguna (misalnya Singapore bila tersedia). Simpan password di password manager; jangan kirim lewat chat.
2. Setelah project siap, buka **SQL Editor → New query**. Salin seluruh isi `E:\web\webchatskripsi\supabase\schema.sql`, lalu **Run**. Script dapat dijalankan ulang tanpa menghapus history. Pastikan tabel `kawasan_history` berisi satu baris dengan `id = shared`.
3. Ambil **Project URL** dari Connect atau Integrations → Data API, kemudian **secret key** dari Settings → API Keys (format `sb_secret_...`). Key ini berbeda dari password database; tidak perlu connection string Postgres, Supabase Auth, atau bucket Storage.
4. Di Vercel → project Kawasan AI → Settings → Environment Variables, isi `SUPABASE_URL` dan `SUPABASE_SECRET_KEY`, ditambah konfigurasi pada tabel di atas. Secret hanya disimpan di Vercel atau `E:\web\webchatskripsi\.env.local`, tidak di repository atau chat. Gunakan database terpisah untuk Preview agar pengujian tidak mengubah history Production.
5. Deploy/redeploy versi terbaru setelah konfigurasi tersimpan. Bila SQL/config belum siap, layar menampilkan error database dan tidak diam-diam menyimpan chat ke mode lokal.
6. Uji dari dua browser/perangkat: login dengan kode berbeda, buat/kirim chat di perangkat pertama, tunggu status tersimpan, lalu lihat dari perangkat kedua (muat ulang atau tunggu 10 detik). Uji juga rename/delete; perubahan berlaku untuk semua orang.

Backend Next.js memvalidasi session sebelum mengakses REST API Supabase lewat `fetch`. Secret key dikirim hanya pada header `apikey` server-ke-server. SQL mengaktifkan RLS dan mencabut akses `anon`/`authenticated`; **jangan membuat policy baca/tulis publik**. Secret backend melewati RLS, sehingga siapa pun yang memperoleh secret ini bisa mengakses database. Pembuatan project, SQL asli, dan konfigurasi Vercel harus dilakukan oleh pemilik akun; pengujian lokal memakai mock, bukan project asli.

## Riwayat dan pengaturan

- Sidebar kiri: New Brainstorm, pilih riwayat, edit judul (ikon pensil), hapus dengan konfirmasi, dan pengaturan.
- Desktop: sidebar lebar/kompak; mobile: tombol menu membuka drawer.
- Pengaturan: nama panggilan (maksimal 60 karakter) dan personalisasi (2000 karakter), dikirim pada pesan berikutnya ke provider.
- Riwayat (termasuk teks lampiran) ada di Supabase dan dapat dibaca, diubah, serta dihapus semua pemegang kode. Bukan percakapan privat per pengguna; logout tidak menghapus history bersama. Nama panggilan, preferensi, dan sidebar disimpan lokal pada browser yang sama untuk semua kode; teks respons AI bisa menyebut nama/preferensi dan tetap terlihat bersama.
- Autosave setelah perubahan berhenti selama 600 ms, ditunda selama AI merespons. Polling setiap 10 detik pada tab terlihat dan tidak ada perubahan lokal; bukan realtime streaming. Status belum tersimpan harus diselesaikan sebelum menutup tab. Bila gagal, gunakan **Coba simpan** atau **Ekspor cadangan** (JSON; belum ada UI impor).
- Penyimpanan memakai satu snapshot dengan revision UUID dan conditional update atomik. Penulis kedua mendapat konflik HTTP 409, bukan menimpa perubahan orang lain. Ekspor perubahan lokal sebelum **Muat ulang**, lalu ulangi perubahan yang diperlukan. Perubahan bersamaan belum digabung otomatis.
- Batas awal untuk grup kecil: **100 percakapan**, **200 pesan per percakapan**, dan **3 MB total request snapshot bersama** (termasuk teks lampiran). Batas total ini berbeda dari batas pemilihan file 20 MB. Ekspor lalu hapus history jika penuh; volume lebih besar perlu skema per-percakapan dan pagination. Cadangan ekspor mengandung data chat—simpan dengan aman.
- Data localStorage lama (`ruang-ai-messages` dan `kawasan-ai-v2:*`) tetap utuh dan **tidak otomatis dipublikasikan** ke grup. Migrasi/impor riwayat lama belum tersedia di UI. Hanya preferensi baru disimpan dalam `kawasan-ai-preferences`; chat bersama tidak dicache permanen oleh aplikasi di localStorage.
- Avatar SVG lokal: `E:\web\webchatskripsi\public\avatars\user.svg`.

## Lampiran: batas 20 MB dan keterbatasan nyata

- Batas pemilihan per file adalah 20 × 1024 × 1024 byte. Executable/script sistem seperti EXE, MSI, BAT, CMD, dan PS1 ditolak.
- Teks/kode dibaca di browser sebagai teks UTF-8, bukan base64; maksimal 100.000 karakter pertama dikirim dan disimpan sebagai konteks percakapan. UI memperingatkan jika terpotong.
- PDF, gambar, Office, audio/video, arsip, dan format biner lain saat ini **hanya metadata**. AI belum dapat membaca isinya; UI menyatakan ini secara eksplisit. Tidak ada penyimpanan file mentah di server.
- Bukan upload biner 20 MB ke Vercel Function: batas body Function sekitar 4,5 MB. Aplikasi membatasi request JSON ke 3 MB dan maksimal 200 pesan. Analisis dokumen/biner penuh perlu parser dan/atau direct upload storage serta dukungan model/provider, belum diimplementasikan.
- Jangan menganggap file dipindai antivirus. Batas ekstensi hanya pemeriksaan dasar.

## Keamanan dan batasan

Session HMAC ditandatangani server, kedaluwarsa setelah 7 hari, cookie HttpOnly/Secure di production/SameSite Strict. Cookie `authenticated` yang dapat dipalsukan tidak lagi diterima. Secret dan kode tidak dikirim ke frontend. Permintaan mutasi dengan Origin lain ditolak.

Pembatasan login 10 percobaan/15 menit bersifat best-effort per proses. Untuk proteksi terdistribusi pada Vercel gunakan WAF/rate limit atau shared store. Logout menghapus cookie browser, bukan mencabut salinan token yang dicuri; rotasi kode atau SESSION_SECRET untuk pencabutan. Ini bukan audit keamanan menyeluruh. Framework masih versi existing; pembaruan keamanan dependency perlu ditinjau sebelum penggunaan publik yang luas.

## Validasi

Jalankan dari `E:\web\webchatskripsi`:

```sh
npm test
npm run build
npm run test:smoke
```

Smoke test menjalankan build production, provider AI palsu, dan mock REST Supabase: menguji autentikasi, riwayat lintas kode, update konflik, penolakan origin/body tidak valid, serta error database tanpa memakai secret asli atau kuota TokenGateway. Jalankan build terlebih dahulu. Pengujian browser visual dan SQL/RLS di project Supabase asli masih perlu dilakukan setelah konfigurasi.