# Kawasan AI

Chat pribadi berbasis Next.js dengan dropdown model TokenGateway, avatar lokal, sidebar yang bisa diciutkan, New Brainstorm, ubah/hapus judul riwayat, dan personalisasi nama serta gaya jawaban.

## Menjalankan lokal

1. Salin `E:\web\webchatskripsi\.env.example` ke `E:\web\webchatskripsi\.env.local`.
2. Isi `ACCESS_CODE`, `SESSION_SECRET`, `TOKEN_GATEWAY_BASE_URL`, dan `TOKEN_GATEWAY_API_KEY`.
3. Buat SESSION_SECRET acak minimal 32 karakter dengan `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Jangan commit nilainya.
4. Jalankan `npm install`, lalu `npm run dev` dari `E:\web\webchatskripsi`.
5. Base URL harus sesuai provider; aplikasi menambahkan `/chat/completions` otomatis. Model harus merupakan ID yang diterima provider.

## Vercel dan dua kode akses

Import repository `ndikkkk/kawasanAI`, pilih Next.js dan root directory default. Environment yang perlu diisi pada Production (juga Preview jika dipakai):

| Nama | Jenis | Keterangan |
| --- | --- | --- |
| ACCESS_CODE | Secret/Sensitive | Kode login pertama, tetap seperti sebelumnya |
| ACCESS_CODE_2 | Secret/Sensitive | Opsional: kode kedua yang berbeda; jangan dipisahkan dengan koma dalam ACCESS_CODE |
| SESSION_SECRET | Secret/Sensitive | Wajib, acak minimal 32 karakter; bukan kode login |
| TOKEN_GATEWAY_API_KEY | Secret/Sensitive | API key dari TokenGateway |
| TOKEN_GATEWAY_BASE_URL | Config | Base URL dari provider, termasuk /v1 jika disyaratkan |
| TOKEN_GATEWAY_MODEL | Config | Opsional: default jika request tidak mengirim model |
| SYSTEM_PROMPT | Config | Opsional: instruksi umum asisten |

Simpan lalu redeploy. Versi ini menolak login jika SESSION_SECRET belum diisi. Cookie lama sengaja tidak berlaku: pengguna perlu login ulang.

Kedua kode memiliki izin dan kuota provider yang sama, bukan akun dengan saldo terpisah. Riwayat/pengaturan dipisahkan per kode di browser. Kode yang sama di perangkat berbeda belum menyinkronkan riwayat. Mengubah kode/SESSION_SECRET membatalkan session terkait dan mengubah identitas penyimpanan; data lama tetap di browser tetapi tidak otomatis muncul di identitas baru.

## Riwayat dan pengaturan

- Sidebar kiri: New Brainstorm, pilih riwayat, edit judul (ikon pensil), hapus dengan konfirmasi, dan pengaturan.
- Desktop: sidebar lebar/kompak; mobile: tombol menu membuka drawer.
- Pengaturan: nama panggilan (maksimal 60 karakter) dan personalisasi (2000 karakter), dikirim pada pesan berikutnya ke provider.
- Penyimpanan menggunakan localStorage; bukan database, bukan backup, dan tidak terenkripsi. Orang yang menguasai profil browser dapat membaca datanya. Logout tidak menghapus histori.
- Riwayat lama `ruang-ai-messages` dimigrasikan hanya untuk kode pertama. Sumber lama tidak dihapus. JSON rusak tidak ditimpa otomatis; storage penuh menampilkan peringatan.
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

Smoke test menjalankan build production dan provider lokal palsu: tidak memakai API key asli atau kuota TokenGateway. Pengujian browser visual belum otomatis.