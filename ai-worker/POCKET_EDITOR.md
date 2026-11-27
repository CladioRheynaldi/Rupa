# Saku dengan bentuk terarah

Di Desain & Pratinjau, pilih **Jenis perubahan → Tambahkan saku**. Pilih bentuk
(persegi panjang atau sudut bawah membulat), warna (navy/hitam/krem), lalu atur
lebar/tinggi visual. Geser nomor di foto untuk memindahkan garis saku. Konfirmasi
pengaturan sebelum membuat tiga variasi. Mengubah pengaturan membatalkan konfirmasi.

Tiga keluaran saku terarah sekarang menggunakan desain berbeda: saku terbuka
klasik, saku dengan penutup tanpa kancing, dan saku dengan lipit tengah. Warna,
bentuk luar, posisi serta ukuran visual tetap sama. Backend mengirim indeks
desain 0–2, lalu worker menyesuaikan prompt sekaligus sketsa input; bukan hanya
mengganti seed atau menaikkan strength. Label dan instruksi masing-masing gambar
disimpan bersama variasi. Desain ini adalah alternatif untuk dipilih pelanggan,
bukan tiga hasil identik yang harus mengikuti semua detail konstruksi yang sama.
Deskripsi bebas tidak otomatis memperoleh tiga tipe ini; gunakan pilihan saku
terarah. Jenis perubahan lain tetap memakai variasi seed.

Ukuran adalah persentase gambar, bukan ukuran fisik dalam cm. Catatan penjahit
disimpan tetapi tidak diterjemahkan menjadi perubahan visual otomatis.

Spesifikasi terstruktur disimpan pada markup pesanan dan snapshot permintaan AI.
Worker memakai spesifikasi langsung, tanpa meminta model bahasa menulis ulangnya.
Garis saku di UI dan sketsa input memakai koordinat yang sama. Area edit sedikit
lebih besar untuk bayangan dan penyatuan kain; piksel di luar area itu dikembalikan
dari foto asli. Tidak diperlukan dataset baru atau pelatihan ulang.

Ini metode hibrida **sketsa geometri + SDXL**, bukan generasi teks murni.
Worker menggambar sketsa saku dengan bukaan atas dan jahitan tiga sisi, kemudian
menjalankan SDXL pada 1024px, 40 langkah, strength 0.55, guidance 7.5.
ControlNet dimatikan pengaruhnya untuk jalur ini agar tepi kaos polos tidak
menghalangi bentuk baru. Instalasi pipeline saat ini tetap memuat bobot ControlNet.
Tidak ada pengembalian sketsa mentah sebagai hasil AI jika inference gagal.

Deskripsi bebas tetap tersedia. Permintaan satu saku navy persegi panjang yang
dikenali juga memakai sketsa pendamping secara otomatis. Pilihan terstruktur
lebih jelas karena warna/bentuk/posisi tidak bergantung pada penerjemahan teks.

Keterbatasan: kain tipis/transparan, foto miring, tubuh manusia, saku berlogo atau
berkancing belum divalidasi. Variasi bisa tampak mirip. Hasil ilustratif perlu
disepakati bersama penjahit. Tidak ada jaminan semua keluaran berbentuk saku benar.

Verifikasi otomatis: `python -m unittest test_sdxl test_edit_mask test_pocket_layout`
dan `node --import tsx --test tests/*.test.ts` dari direktori masing-masing.
Jika Turbopack mencoba membaca bobot Python yang besar di Windows, gunakan
`node node_modules/next/dist/bin/next build --webpack`.
