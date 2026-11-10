# Kawasan AI

Chat pribadi berbasis Next.js dengan dropdown model TokenGateway, avatar lokal, sidebar yang bisa diciutkan, New Brainstorm, ubah/hapus judul riwayat, dan personalisasi nama serta gaya jawaban.

### Perilaku chat

- Kolom pesan tetap di bawah viewport; hanya area percakapan yang bergulir. Input panjang memiliki scroll internal agar tombol kirim tetap terlihat.
- Tampilan mengikuti jawaban streaming ketika berada di bawah. Scroll ke atas menghentikan follow sementara; tombol **Pesan terbaru** mengaktifkannya kembali. Mengirim pesan atau berpindah percakapan juga kembali ke bawah.
- Jawaban AI yang selesai memiliki tombol **Salin**, menyalin teks asli beserta sintaks Markdown. Clipboard membutuhkan izin browser dan secure context (HTTPS atau localhost); kegagalan ditampilkan, bukan dianggap berhasil.
- Bar judul hanya berisi judul percakapan, tanpa spinner. Indikator AI sedang merespons tetap ada di area pesan.

### Evaluasi FreeConvert (belum diintegrasikan)

FreeConvert menyediakan konversi [PDF ke TXT](https://www.freeconvert.com/pdf-to-txt) dan [DOCX ke TXT](https://www.freeconvert.com/docx-to-txt), serta [API resmi](https://www.freeconvert.com/api/v1/). Halaman [harga](https://www.freeconvert.com/pricing) saat diperiksa menyebut 20 conversion minutes/hari gratis untuk web/API, maksimal 5 menit/file pada penggunaan gratis; API memerlukan akun. Kuota/harga dapat berubah. Ini bukan konversi gratis tanpa batas atau jaminan jumlah file tertentu.

Layak diuji sebagai alternatif untuk dokumen berbasis teks pada hosting tanpa Java. Dukungan Markdown dan OCR PDF scan pada jalur PDF-ke-TXT belum terverifikasi; jangan menganggapnya pengganti OCR Azure. TXT juga kehilangan struktur tabel/format. Sebelum integrasi, verifikasi pasangan format pada API/Job Builder dan uji dokumen multi-halaman nyata, scan, tabel, serta rumus. File akan dikirim ke pihak ketiga; FreeConvert menyatakan penghapusan otomatis setelah 8 jam. Integrasi perlu secret server, persetujuan upload, job/polling terautentikasi, validasi URL unduhan, batas ukuran/kuota dan error yang eksplisit. Parser aktif belum diubah.

## Menjalankan lokal

1. Salin `E:\web\webchatskripsi\.env.example` ke `E:\web\webchatskripsi\.env.local`.
2. Isi `ACCESS_CODE`, `SESSION_SECRET`, `TOKEN_GATEWAY_BASE_URL`, dan `TOKEN_GATEWAY_API_KEY`.
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
| TOKEN_GATEWAY_API_KEY | Secret/Sensitive | API key dari TokenGateway |
| TOKEN_GATEWAY_BASE_URL | Config | Base URL dari provider, termasuk /v1 jika disyaratkan |
| TOKEN_GATEWAY_MODEL | Config | Opsional: default jika request tidak mengirim model |
| SYSTEM_PROMPT | Config | Opsional: instruksi umum asisten |

Simpan lalu redeploy. Tidak diperlukan akun/database Supabase. Versi ini menolak login jika SESSION_SECRET belum diisi. Cookie lama sengaja tidak berlaku: pengguna perlu login ulang.

Pada halaman login masukkan **salah satu kode**, bukan seluruh daftar. Spasi di awal/akhir diabaikan, entri kosong diabaikan, kode duplikat digabung, dan huruf besar/kecil tetap dibedakan. Koma adalah pemisah, sehingga tidak dapat menjadi bagian dari kode. Menambah/mengurutkan ulang daftar tidak membatalkan session kode yang masih terdaftar; menghapus kode membatalkan session kode tersebut (pastikan juga tidak tersisa di ACCESS_CODE_2).

Semua kode memiliki izin dan kuota provider yang sama, bukan akun dengan saldo terpisah. Riwayat tersimpan secara lokal pada browser/perangkat yang digunakan dan tidak dibagikan lintas perangkat.

## Riwayat dan pengaturan

- Sidebar kiri: New Brainstorm, pilih riwayat, edit judul (ikon pensil), hapus dengan konfirmasi, dan pengaturan.
- Desktop: sidebar lebar/kompak; mobile: tombol menu membuka drawer.
- Pengaturan: nama panggilan (maksimal 60 karakter) dan personalisasi tanpa batas khusus 2.000 karakter, dikirim pada pesan berikutnya ke provider. Kapasitas penyimpanan browser, batas total request 3 MB, dan konteks model tetap berlaku; instruksi tidak dipotong diam-diam.
- Tombol terang/gelap tersedia di semua halaman. Pilihan tema tersimpan lokal di browser; tanpa pilihan tersimpan, mengikuti tema perangkat.
- Konfirmasi hapus, muat ulang perubahan lokal, dan keluar dengan perubahan belum tersimpan memakai dialog aplikasi. Peringatan saat menutup tab tetap mengikuti browser untuk melindungi perubahan belum tersimpan.
- Kolom pesan membesar otomatis mengikuti isi tanpa pegangan resize manual.
- Riwayat (termasuk teks lampiran), nama panggilan, preferensi, dan sidebar disimpan di browser lokal dan tidak dibagikan lintas browser/perangkat. Logout tidak menghapus history lokal.
- Autosave ke browser setelah perubahan berhenti selama 600 ms, ditunda selama AI merespons. Bila browser menolak penyimpanan, gunakan **Ekspor cadangan** (JSON).
- Kapasitas bergantung pada browser; hapus percakapan lama atau ekspor cadangan bila penuh. Cadangan ekspor mengandung data chat—simpan dengan aman.
- Data localStorage lama (`ruang-ai-messages` dan `kawasan-ai-v2:*`) tetap utuh. Riwayat lama di Supabase tidak dimigrasikan otomatis; aplikasi kini tidak mengakses database tersebut.
- Avatar SVG lokal: `E:\web\webchatskripsi\public\avatars\user.svg`.

## Membaca PDF, scan, DOCX, dan teks

- **Teks/kode UTF-8:** dibaca di browser, file maksimal 20 MiB. Tidak memakai layanan ekstraksi berbayar.
- **PDF:** dengan `DOCUMENT_PARSER=opendataloader` (default contoh) diproses di server aplikasi melalui CLI Java bawaan `@opendataloader/pdf`; hasilnya Markdown. File tetap diunggah ke server, bukan diproses di browser, tetapi tidak dikirim ke Azure atau hybrid backend. **Mode lokal ini belum melakukan OCR**: halaman scan/gambar dapat terlewat pada PDF campuran, dan kelengkapan halaman belum divalidasi otomatis. Periksa hasil dengan dokumen asli; gunakan OCR terpisah jika diperlukan. Jangan menganggap PDF campuran telah terbaca lengkap.
- **DOCX:** hanya tersedia melalui Azure saat `DOCUMENT_PARSER=azure`. OpenDataLoader fokus pada PDF dan tidak memproses Word/Office.
- **Azure:** saat `DOCUMENT_PARSER=azure`, PDF hasil scan dan DOCX dikirim setelah persetujuan ke Azure Document Intelligence `prebuilt-read`, REST API `2024-11-30`. DOC lama, gambar terpisah, audio/video, dan arsip ditolak, bukan sekadar dilampirkan sebagai metadata.
- PDF/DOCX maksimal **4 MiB** melalui endpoint terautentikasi `/api/documents`. Pemeriksaan signature awal bukan antivirus; parser memvalidasi struktur. Dukungan ukuran ini tidak berarti OpenDataLoader langsung kompatibel dengan Vercel: Java harus tersedia di runtime.
- Maksimal **500.000 karakter hasil ekstraksi** di memori browser. Dokumen lebih panjang ditolak dengan pesan eksplisit, tidak dipotong. Ekstraksi Azure sudah dapat dikenai biaya walaupun hasil terlalu panjang atau tidak terbaca.
- Dokumen dibagi tanpa kehilangan karakter menjadi bagian maksimal **500.000 karakter** (sama dengan batas ekstraksi). Untuk dokumen multi-bagian pengguna wajib memilih bagian; tidak otomatis mengirim 500.000 karakter pertama. Pratinjau menampilkan teks yang akan dikirim. Bagian tersisa tetap di memori selama percakapan ini terbuka, tetapi hilang setelah pindah percakapan, reload, atau menutup dokumen.
- Analisis bertahap: pilih bagian → minta analisis → pilih bagian berikutnya → minta sintesis. **Bukan RAG/retrieval otomatis**; AI hanya menerima bagian yang sudah dikirim. Batas model bergantung pada provider dan tidak diketahui dari nama model saja. Bila konteks penuh, mulai brainstorm baru dengan ringkasan sebelumnya. Angka karakter bukan jumlah token.
- Request chat tetap maksimal 3 MiB/200 pesan. Banyak dokumen dapat memenuhi penyimpanan browser: ekspor lalu hapus percakapan lama. OpenDataLoader menulis PDF sementara di direktori temp server dan menghapusnya pada jalur selesai/gagal; crash atau penghentian paksa server dapat meninggalkan file sementara.
- OCR bisa salah, terutama rumus, tabel, multikolom, kutipan, dan nomor halaman. DOCX hanya teks tertanam: gambar di DOCX **tidak** di-OCR; ekspor ke PDF jika perlu OCR gambar tersebut. Pratinjau bukan reproduksi layout asli. Periksa dengan dokumen asli sebelum digunakan dalam skripsi.
- Lampiran metadata-only dari riwayat lama tetap terbaca sebagai metadata; tidak otomatis diekstrak ulang atau diklaim sudah dibaca.

### Konfigurasi OpenDataLoader lokal

1. Server memerlukan **Node.js 22.13+** (sesuai versi paket terpasang) dan **Java 11+** di PATH. Periksa `node --version` dan `java -version`, kemudian jalankan `npm install` dari `E:\web\webchatskripsi`.
2. Isi `DOCUMENT_PARSER=opendataloader` pada `E:\web\webchatskripsi\.env.local` atau environment server lalu restart aplikasi. Tidak membutuhkan key Azure. Konfigurasi auth, database, dan provider AI tetap diperlukan. `.env.example` bukan konfigurasi aktif. Jika variabel tidak diisi, aplikasi tetap memakai Azure demi kompatibilitas instalasi lama. UI membaca konfigurasi dari server; tidak perlu variabel `NEXT_PUBLIC_DOCUMENT_PARSER`.
3. Gunakan server/VPS/container dengan Java dan direktori temp yang bisa ditulis. Integrasi ini **bukan deployment Vercel siap pakai**; untuk hosting tanpa Java diperlukan worker terpisah yang belum diimplementasikan. Jalankan aplikasi dari root proyek. Tracing Next.js menyertakan JAR untuk route dokumen.
4. PDF diproses sinkron dan hasil dikembalikan pada POST yang sama, tanpa job dalam memori lintas request. Batas: satu proses ekstraksi aktif per instance, heap JVM 512 MiB (bukan total memori proses), timeout 20 detik, buffer keluaran 2 MiB, 5 upload per kode/10 menit, dan 500.000 karakter hasil. PDF besar/kompleks dapat gagal karena batas waktu; batas ini tidak dihapus. Tidak ada fallback otomatis ke Azure berbayar.
5. Temp file memakai nama acak di server. Produksi perlu isolasi OS/container non-root, kuota disk/memori, pembersihan temp setelah crash, dan limit terdistribusi. Parser subprocess bukan sandbox keamanan. Jika server menerima sinyal pembatalan request, proses Java dihentikan; deteksi browser terputus bergantung hosting. Timeout tetap berlaku.
6. Tidak ada biaya lisensi parser per halaman pada mode lokal, tetapi hosting/CPU dan token AI tetap dapat berbiaya. Scan/OCR hybrid, DOCX lokal, retrieval otomatis, dan perubahan ikon **belum termasuk** integrasi ini.

Validasi dari root proyek:

```powershell
npm test
npm run test:opendataloader
npm run build
npm run test:smoke
$env:KAWASAN_LOCAL_PDF='1'
npm run test:smoke
Remove-Item Env:KAWASAN_LOCAL_PDF
```

Tes OpenDataLoader menjalankan Java pada PDF sintetis dua halaman, PDF kosong, dan PDF rusak. Smoke mode lokal menguji upload PDF dua halaman melalui production route; AI/database tetap mock. Ini bukan validasi akurasi skripsi nyata, tabel kompleks, atau scan. Dokumentasi: [OpenDataLoader Node.js](https://opendataloader.org/docs/quick-start-nodejs).

### Konfigurasi Azure dan biaya

Bagian ini hanya berlaku saat `DOCUMENT_PARSER=azure`.

1. Buat resource **Azure AI Document Intelligence**, pilih region sesuai kebutuhan privasi dan tier **S0**. Ini layanan terpisah dari TokenGateway dan Supabase.
2. Ambil endpoint dan key di resource Azure. Isi server environment berikut di lokal/Vercel, lalu redeploy:
   - `DOCUMENT_INTELLIGENCE_ENDPOINT=https://NAMA-RESOURCE.cognitiveservices.azure.com` (URL root HTTPS, tanpa path tambahan).
   - `DOCUMENT_INTELLIGENCE_KEY`: secret dari Azure; jangan memakai prefix `NEXT_PUBLIC_` atau commit nilai aslinya.
   - `DOCUMENT_INTELLIGENCE_TIER=S0`: deklarasi bahwa resource benar-benar memakai S0. Aplikasi tidak dapat memeriksa SKU Azure; admin harus memastikan tier resource sesuai.
3. **F0 tidak didukung** karena hanya memproses dua halaman pertama; salah mendeklarasikan F0 sebagai S0 dapat menghasilkan ekstraksi parsial yang tidak terdeteksi. Resource S0 diperlukan untuk dokumen kuliah/skripsi multi-halaman.
4. Azure Read ditagih berdasarkan halaman yang dianalisis; DOCX dihitung menurut unit halaman Azure, bukan selalu halaman tampilan Word. Token AI dan hosting ditagih terpisah. Tarif bergantung region, mata uang, dan kontrak: lihat [harga resmi](https://azure.microsoft.com/en-us/pricing/details/ai-document-intelligence/) dan kalkulator Azure sebelum mengaktifkan. Tidak ada nominal biaya tetap atau klaim OCR gratis dalam aplikasi.
5. Atur Azure Cost Management budget/alert dan batas pemakaian/WAF. Budget alert bukan hard spending cap. Batas aplikasi 5 upload per kode/10 menit hanya best-effort per proses; bukan kuota terdistribusi dan bukan jaminan batas tagihan. Seluruh halaman upload dianalisis, tanpa page-range filter.
6. Dokumen dikirim ke pihak ketiga Azure. Pastikan izin pemilik dan kebijakan kampus; jangan unggah data rahasia tanpa izin. Retensi hasil sementara dan kebijakan layanan Azure tetap berlaku. Tombol batal hanya menghentikan penantian browser, bukan membatalkan job Azure atau menjamin biaya berhenti. Polling memakai token HMAC terikat subjek dengan masa berlaku 10 menit; UI menunggu maksimal 4 menit.

Dokumentasi format Azure: [Azure Read](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/read?view=doc-intel-4.0.0).

Ikon tab bermerek K + kilau dengan warna Kawasan AI berada di `E:\web\webchatskripsi\app\icon.svg`, melalui konvensi metadata Next.js.

## Keamanan dan batasan

Session HMAC ditandatangani server, kedaluwarsa setelah **10 menit**, cookie HttpOnly/Secure di production/SameSite Strict. Heartbeat setiap 30 detik memperpanjang sesi hanya saat tab **terlihat, fokus, dan online** (membaca/menunggu jawaban pada tab aktif tetap dihitung aktif, tidak harus mengetik). Menutup tab, pindah tab/aplikasi, atau offline menghentikan perpanjangan; setelah sekitar 10 menit pengguna wajib login ulang. Jika ada tab lain yang masih aktif pada browser yang sama, cookie bersama tetap diperpanjang. Reload/buka kembali sebelum kedaluwarsa masih boleh masuk. Semua API memeriksa kedaluwarsa server; polling history tidak memperpanjang sesi. Browser yang dibekukan/offline akan diarahkan ke login saat kembali aktif dan server menolak sesi. Permintaan AI yang sudah diterima tidak otomatis dibatalkan oleh kedaluwarsa sesi, tetapi akses berikutnya memerlukan login. Cookie `authenticated` yang dapat dipalsukan tidak diterima. Secret dan kode tidak dikirim ke frontend. Permintaan mutasi dengan Origin lain ditolak.

### Penyimpanan dan privasi

Riwayat percakapan dan preferensi disimpan di `localStorage` browser yang sedang digunakan; aplikasi tidak mengirimnya ke database aplikasi/Supabase. Menghapus data situs/browser akan menghapus riwayat lokal. Tidak ada sinkronisasi lintas perangkat. Aplikasi tidak menyimpan IP, lokasi, atau user-agent login ke database. Hosting (misalnya Vercel), reverse proxy, browser, dan layanan AI/provider tetap dapat memproses metadata koneksi sesuai kebijakan mereka; perubahan ini hanya menghapus pencatatan oleh aplikasi ke Supabase, bukan logging bawaan infrastruktur. Data/tabel lama di project Supabase tidak terhapus oleh perubahan kode ini dan harus dihapus manual oleh pemilik bila diinginkan.

### Header tetap dan streaming AI

Logo, tombol keluar, dan judul percakapan berada di luar `.chat-scroll`; hanya area isi chat/composer yang bergulir, pada desktop maupun mobile. Sidebar memiliki scroll sendiri.

Chat meminta `stream: true` ke `/chat/completions`, meneruskan SSE tanpa buffering aplikasi, dan menampilkan jawaban bertahap. Timer abort AI 115 detik (server) dan 125 detik (browser) sudah dihapus; tombol **Hentikan respons** membatalkan penantian. Gateway yang mengembalikan JSON tetap didukung tanpa request ulang otomatis. Error/stream terputus tidak dianggap jawaban selesai: teks sementara tetap terlihat dengan label belum disimpan, prompt dikembalikan ke input, dan pengguna dapat menyalin teks sementara sebelum mengirim ulang. Pembatalan tidak menjamin provider menghentikan proses/biaya. Respons lengkap tetap tunduk pada batas karakter, snapshot, dan konteks model yang ada.

**90.000 ms pada TokenGateway bukan timer lama aplikasi (115.000 ms).** Streaming dapat membantu bila gateway mendukungnya dan timeout terkait menunggu respons lengkap, tetapi tidak menghapus hard timeout/first-token timeout provider. Jika tetap 504 sekitar 90 detik, admin TokenGateway perlu memeriksa timeout upstream, model, dan dukungan streaming. Tidak ada retry otomatis atau pemotongan prompt diam-diam. Uji model/prompt asli setelah deploy; pengujian lokal memakai mock dan tidak membuktikan konfigurasi TokenGateway produksi.

Route chat meminta `maxDuration = 300` detik untuk hosting. **Ini bukan durasi tak terbatas**: aktifkan Fluid Compute/konfigurasi yang mendukungnya pada Vercel dan periksa batas plan; streaming juga tunduk pada maksimum hosting. Pada VPS, timeout reverse proxy/runtime/provider tetap perlu ditinjau. Untuk job yang benar-benar melebihi batas hosting diperlukan worker/job persisten terpisah, belum diimplementasikan di versi ini.

Pembatasan login 10 percobaan/15 menit bersifat best-effort per proses. Untuk proteksi terdistribusi pada Vercel gunakan WAF/rate limit atau shared store. Logout menghapus cookie browser, bukan mencabut salinan token yang dicuri; rotasi kode atau SESSION_SECRET untuk pencabutan. Ini bukan audit keamanan menyeluruh. Framework masih versi existing; pembaruan keamanan dependency perlu ditinjau sebelum penggunaan publik yang luas.

## Validasi

Jalankan dari `E:\web\webchatskripsi`:

```sh
npm test
npm run build
npm run test:smoke
```

Smoke test menjalankan build production dan provider AI palsu untuk menguji autentikasi, batas payload chat/dokumen, penolakan origin, dan logout tanpa menghubungi Supabase atau kuota TokenGateway. Jalankan build terlebih dahulu.