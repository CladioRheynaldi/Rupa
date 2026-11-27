# Hasil verifikasi AI lokal — 23 Oktober 2026

Pengujian dilakukan pada prototipe lokal dengan Python 3.13, PyTorch 2.10.0 **CPU**, bukan CUDA. Foto/ilustrasi pengujian berasal dari fixture demo, bukan data pelanggan nyata.

## Yang sudah diuji

- Build produksi Next.js berhasil; 24 tes domain aplikasi dan 12 tes kontrak/aturan worker lulus.
- Enam file bobot safetensors cocok dengan SHA-256 pada metadata repositori sumber. Revisi dikunci di `download_models.py`; hasil pemeriksaan ada di `../test-results/model-checksums.json`.
- **Pencarian FashionCLIP nyata:** permintaan kaos merah dengan tengkorak di tengah mengembalikan satu sketsa yang sesuai. Permintaan kaos merah mengembalikan seluruh empat referensi yang sesuai. Motif naga yang tidak ada menghasilkan kosong. Pengujian pertama sekitar 11 detik; berikutnya sekitar 0,4 detik dengan cache.
- **Qwen3.5-0.8B nyata:** membaca kaos merah dari gambar dan menghasilkan bahan konsultasi. Uji desain sekitar 18 detik dan ukuran sekitar 7 detik. Ukuran tersimpan 80 → 76 cm menghasilkan perhitungan −4 cm oleh sistem, terpisah dari teks generatif.
- **InstructPix2Pix nyata:** foto gaun merah diedit menjadi ilustrasi gaun biru. Uji pertama sekitar 54 detik, resolusi maksimum 256 px/12 langkah pada CPU. Hasil dilihat langsung pada `../test-results/ai-preview.jpg`.
- **Browser:** unggah foto → deskripsi → referensi; simpan ukuran → saran dan perhitungan; unggah foto → pratinjau → foto awal/hasil berdampingan. Katalog admin tampil, tidak ada page error, dan halaman pratinjau tidak melebar di viewport ponsel 390 px.

## Batas hasil ini

Ini verifikasi fungsi, bukan pengukuran akurasi statistik atau penerimaan pelanggan. Katalog awal berisi 32 **sketsa ilustrasi**, bukan foto produk nyata. Admin perlu menambahkan foto berizin dan anotasi yang benar untuk penggunaan yang lebih relevan.

Model bahasa ringan kadang memberi saran kurang relevan. Filter menolak beberapa penyimpangan warna/area tubuh; pertanyaan dari aturan layanan diberi label terpisah. Filter tersebut belum menjamin seluruh jawaban benar.

Pratinjau dapat mengubah detail yang tidak diminta, termasuk tampilan wajah/latar jika foto memuat orang. Detail kecil, tulisan, logo, dan ukuran tidak dijamin akurat. Gunakan foto produk tanpa wajah untuk contoh awal; penjahit tetap memeriksa rancangan dan kelayakan fisik. Mode ukuran bukan pengukur tubuh otomatis atau prediktor fit yang tervalidasi.

Foto pelanggan tidak digunakan untuk melatih model atau otomatis menjadi katalog. Konfigurasi lokal menjalankan inference tanpa penyedia API eksternal. GPU, beban banyak pelanggan, dan mutu pada variasi kain/produk nyata belum dibenchmark.


## Penggabungan desain dan pratinjau — 23 Oktober 2026

UI menyediakan dua mode: Desain & Pratinjau dan Bantu Sesuaikan Ukuran. Mode desain memanggil analisis, pencarian, dan image edit dalam satu permintaan pelanggan. URL preview lama membuka mode gabungan. Katalog menjadi 40 sketsa dengan contoh saku kanan; kata "sebelah" tidak lagi menghalangi pencarian.

Validasi: build produksi, 25 tes domain dan 13 tes kontrak/aturan worker. Uji browser dengan inference lokal berhasil menampilkan dua gambar, membuka referensi saku kanan, menyimpan pilihan setelah reload, dan meneruskannya sebagai pesan konsultasi. Tampilan mobile diperiksa tanpa overflow. Percobaan awal memakai sketsa ditolak pemeriksa keamanan hasil model; aplikasi mempertahankan saran/referensi dengan pesan kegagalan pratinjau. Percobaan foto produk berikutnya berhasil. Pemeriksa keamanan tetap aktif.

Memilih referensi mengganti acuan gambar kanan dengan label katalog; tidak mengklaim menghasilkan edit foto sesuai referensi tersebut. Pilihan bersifat konsultasi, bukan persetujuan pengerjaan atau jaminan kualitas. Model tetap dapat gagal menerapkan detail kecil secara akurat.
