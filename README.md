# Ruang AI

MVP chat AI pribadi dengan autentikasi kode akses dan lampiran file.

## Menjalankan lokal

1. Salin `.env.example` menjadi `.env.local`.
2. Isi `ACCESS_CODE`, `TOKEN_GATEWAY_API_KEY`, dan `TOKEN_GATEWAY_BASE_URL`. `TOKEN_GATEWAY_MODEL` bersifat opsional karena model dapat dipilih dari dropdown chat.
3. Pastikan `TOKEN_GATEWAY_BASE_URL` mengarah ke endpoint provider yang kompatibel dengan OpenAI (`/chat/completions`).
4. Jalankan `npm install`, lalu `npm run dev`.

Model yang tersedia di dropdown mengikuti daftar pada `lib/models.ts`. File berukuran maksimal 8 MB diterima. `.exe` diblokir. File teks/JSON dikirim sebagai konteks isi file; file lain dikirim sebagai informasi lampiran. Histori percakapan saat ini disimpan di localStorage browser.

## Deploy Vercel

Hubungkan repository ke Vercel, kemudian tambahkan seluruh variabel dari `.env.example` pada Project Settings → Environment Variables. Jangan commit `.env.local` atau API key.