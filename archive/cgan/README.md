# Pipeline cGAN pakaian — eksperimen lokal

**Status 23 Oktober 2026: cGAN sudah dilatih pada subset MagicBrush berisi 65 pasangan edit terkait pakaian (53 train, 6 val, 6 test), 40 epoch / 560 langkah, CPU.** Dataset publik ini memuat target hasil edit sintetis/manual; bukan foto hasil jahit fisik. Hasil evaluasi visual **belum layak untuk pelanggan**: perubahan warna sering sebagian dan detail bisa kabur/tidak sesuai. Model tetap eksperimen. Pratinjau standar aplikasi memakai diffusion.

Checkpoint: `../../.local/cgan/runs/magicbrush-clothing-v1/generator.safetensors`. Laporan: `val-report.json`, `test-report.json`, dan folder gambar pembanding di folder run. Galat masked L1 test 0.3750 vs baseline identitas 0.4070 (~7.9% penurunan galat piksel); ini **bukan akurasi desain 92% atau bukti kesiapan layanan**. Area di luar mask identik karena komposit, bukan hasil kemampuan GAN. Model ini dilatih untuk `edit`, **belum text_to_image**.

Data: [MagicBrush](https://huggingface.co/datasets/osunlp/MagicBrush), CC BY 4.0; atribusi dan preprocessing tercatat di `.local/datasets/magicbrush-clothing/PROVENANCE.json`. Mask publisher memakai kanal alpha transparan untuk area edit; importer mengubahnya menjadi mask biner putih-edit. Foto pelanggan tidak dipakai.

## Dua tugas yang disiapkan

| Tugas | Masukan | Target pelatihan | Perilaku |
| --- | --- | --- | --- |
| `edit` | Foto awal, deskripsi tampilan akhir, mask | Foto sesudah perubahan yang sejajar dengan foto awal | Generator membuat isi area putih. Area hitam disalin dari foto awal. |
| `text_to_image` | Deskripsi dan noise acak | Foto yang sesuai deskripsi | Seluruh gambar dibuat. Secara internal foto awal dikosongkan dan mask dibuat putih penuh. |

Contoh edit: tambahkan saku pada dada kiri pemakai. Contoh generasi: pria memakai kemeja flanel dengan saku dada kiri dan logo lingkaran merah. Untuk memahami keduanya, data latihan harus memuat keduanya; melatih hanya edit tidak otomatis melatih text-to-image.

## Arsitektur yang benar-benar dibuat

1. **Encoder teks beku:** FashionCLIP lokal yang sudah tersedia, mengubah `prompt_en` menjadi vektor. Encoder ini pretrained; generator pakaian baru ini **belum pretrained**. Tidak memerlukan API berbayar atau unduhan model baru.
2. **Generator:** U-Net kecil dengan pengondisian teks dan noise melalui modulasi fitur di setiap blok. Masukan tambahan berupa foto awal dan mask.
3. **Discriminator:** PatchGAN yang menerima foto awal, kandidat hasil, mask, dan vektor teks. Dilatih membedakan pasangan nyata, hasil generator, serta teks yang tidak cocok jika batch mempunyai teks berbeda.
4. **Loss generator:** adversarial + L1 pada area mask. Komposit keras mempertahankan area di luar mask.

Ini **baseline eksperimen buatan proyek**, bukan salinan ManiGAN, AttnGAN, atau klaim inovasi ilmiah baru. Landasan: [pix2pix / conditional adversarial image translation](https://phillipi.github.io/pix2pix/) dan [text-conditioned GAN](https://github.com/reedscot/icml2016). Menyatukan komponen tersebut belum membuktikan kualitas hasil. Noise dapat diabaikan model; variasi desain harus dievaluasi, bukan diasumsikan.

## Format dataset

Gunakan folder khusus, terpisah dari foto pelanggan:

```text
rupa-app/.local/datasets/cgan/
  manifest.jsonl
  images/
    shirt-001-before.png
    shirt-001-after.png
    flannel-001-target.png
  masks/
    shirt-001-pocket.png
```

Salin `manifest.example.jsonl` sebagai template. Contohnya **tidak berisi gambar** dan `rights_confirmed` sengaja `false`, sehingga tidak bisa langsung dianggap dataset sah.

| Field | Penjelasan |
| --- | --- |
| `id` | ID unik setiap contoh. |
| `garment_id` | ID pakaian asli. Semua variasi pakaian yang sama harus dalam satu split. |
| `task` | `edit` atau `text_to_image`. |
| `split` | `train`, `val`, atau `test`. Isi ketiganya dengan pakaian berbeda. |
| `prompt_id` | Deskripsi Indonesia, opsional untuk peninjau manusia. |
| `prompt_en` | Deskripsi Inggris tentang **tampilan akhir**. Wajib; encoder lokal ini tidak menjamin pemahaman Indonesia. Contoh: `a white shirt with one red circular logo on the wearer's left chest`. |
| `before` | Foto sebelum, wajib untuk edit. Path relatif terhadap folder dataset. |
| `target` | Foto target/hasil akhir, wajib untuk kedua tugas. |
| `mask` | PNG grayscale biner: 255 putih = boleh diubah, 0 hitam = dipertahankan. Wajib untuk edit. |
| `license`, `source` | Lisensi/izin yang sebenarnya dan asal gambar. Placeholder ditolak. |
| `rights_confirmed` | `true` hanya setelah hak penggunaan untuk pelatihan memang dipastikan. |

Foto awal, target, dan mask untuk edit harus **sama dimensi dan sejajar**. Foto sebelum/sesudah dari sudut berbeda bukan pasangan edit yang langsung layak. Validator menolak mask kosong, jalur keluar folder, kebocoran split berdasarkan `garment_id`/gambar target identik, serta perubahan besar di luar mask. Toleransi perbedaan rata-rata di luar mask adalah 5/255 per kanal; ini pemeriksaan konsistensi, bukan metrik kualitas desain.

Jangan sekadar mengumpulkan foto kaos biasa dan foto kaos bersaku dari toko berbeda. Model perlu contoh perubahan yang benar-benar berpasangan. Sertakan label sisi **pemakai**, bahan/warna yang terlihat, lokasi, skala detail, dan variasi desain. Teks harus menyebut posisi yang sesuai mask dan target. Anotasi boleh ditinjau penjahit. Foto pelanggan tidak masuk pipeline secara otomatis.

Tidak ada jumlah gambar universal yang menjamin hasil bagus. Mulai dari satu jenis pakaian dan perubahan terukur; nilai pada pakaian yang tidak pernah dilatih. Resolusi default 128 px ditujukan untuk uji kelayakan pelatihan, bukan detail logo siap jual. Naikkan ke 256 px setelah baseline dan kebutuhan GPU diuji. Foto orang penuh dan beberapa detail sekaligus merupakan target jauh lebih sulit.

## Menjalankan di PowerShell

Jalankan dari folder `rupa-app\ai-worker`. Gunakan environment lokal yang sudah ada:

```powershell
.\.venv-local\Scripts\python.exe -m cgan.pipeline --help
```

Sesudah melengkapi dataset dan izin:

```powershell
# 1. Validasi data. Tidak mengunduh atau melatih apa pun.
.\.venv-local\Scripts\python.exe -m cgan.pipeline validate --dataset ..\.local\datasets\cgan --manifest ..\.local\datasets\cgan\manifest.jsonl

# 2. Buat cache embedding teks menggunakan FashionCLIP lokal.
.\.venv-local\Scripts\python.exe -m cgan.pipeline prepare --dataset ..\.local\datasets\cgan --manifest ..\.local\datasets\cgan\manifest.jsonl --embeddings ..\.local\datasets\cgan\embeddings.pt

# 3. Eksperimen awal; 20 epoch di sini contoh parameter, bukan jaminan konvergensi.
.\.venv-local\Scripts\python.exe -m cgan.pipeline train --dataset ..\.local\datasets\cgan --manifest ..\.local\datasets\cgan\manifest.jsonl --embeddings ..\.local\datasets\cgan\embeddings.pt --output ..\.local\cgan\runs\experiment-001 --epochs 20 --size 128 --batch 4 --device cpu

# 4. Evaluasi validation set; test set disimpan untuk evaluasi akhir.
.\.venv-local\Scripts\python.exe -m cgan.pipeline evaluate --dataset ..\.local\datasets\cgan --manifest ..\.local\datasets\cgan\manifest.jsonl --embeddings ..\.local\datasets\cgan\embeddings.pt --checkpoint ..\.local\cgan\runs\experiment-001 --split val --report ..\.local\cgan\validation.json
```

Untuk melanjutkan, jalankan perintah train yang sama dengan `--resume` dan `--epochs` sebagai **total epoch tujuan**, misalnya 40. Resume memerlukan manifest, ukuran, dan arsitektur yang sama; checkpoint tersimpan setiap akhir epoch. Mengubah manifest memerlukan prepare ulang dan eksperimen baru. Latihan yang terputus di tengah epoch dilanjutkan dari checkpoint epoch sebelumnya yang masih valid.

Output: `generator.safetensors`, `metadata.json`, `training.pt`. Metadata selalu `customer_ready: false`; tersedianya checkpoint bukan bukti lulus pengujian.

Mesin saat diperiksa menggunakan **PyTorch CPU**, sehingga contoh perintah memakai `--device cpu`. `--device cuda` hanya dapat digunakan setelah lingkungan PyTorch CUDA dikonfigurasi dan diuji. Pipeline tidak mengubah paket Python global.

## Menghasilkan contoh setelah benar-benar dilatih

```powershell
# Edit: mask biner wajib dan sama dimensi dengan foto awal.
.\.venv-local\Scripts\python.exe -m cgan.sample --checkpoint ..\.local\cgan\runs\experiment-001 --task edit --prompt-en "a white shirt with one red circular logo on the wearer's left chest" --before ..\.local\datasets\cgan\images\shirt-001-before.png --mask ..\.local\datasets\cgan\masks\shirt-001-pocket.png --output ..\.local\cgan\sample-edit.png

# Text-to-image hanya diterima bila checkpoint dilatih pada task itu juga.
.\.venv-local\Scripts\python.exe -m cgan.sample --checkpoint ..\.local\cgan\runs\experiment-001 --task text_to_image --prompt-en "a man wearing a blue flannel shirt with a left chest pocket and a red circular logo" --seed 99 --output ..\.local\cgan\sample-generation.png
```

Contoh jalur menunjukkan format pemanggilan, bukan janji file tersebut sudah tersedia. Script menolak checkpoint tanpa langkah pelatihan. Output PNG disertai metadata eksperimen; gambar di luar mask edit disalin pada resolusi asli. Skala desain di dalam mask dan ketepatan logo tetap perlu diperiksa.

## Cara menilai sebelum menghubungkan ke pelanggan

- Catat apakah permintaan dipenuhi: jenis detail, warna, jumlah, lokasi, dan sisi pemakai.
- Bandingkan input/target/hasil pada pakaian yang tidak pernah dilatih; jalankan beberapa seed untuk mengecek variasi dan collapse.
- Periksa bahan, sambungan, bentuk, tepi mask, dan keterjagaan bagian lain. Minta penjahit menilai apakah hasil bisa diterjemahkan menjadi pekerjaan fisik.
- Laporan otomatis berisi masked L1 dan galat di luar mask. Nilai ini **tidak** membuktikan realisme atau pemahaman teks; error nol di luar mask dijamin komposit, bukan kecerdasan model.
- Tentukan ambang penerimaan dari penilaian manusia dan contoh pembanding. Tidak ada auto-publish checkpoint atau koneksi web yang menyatakan cGAN siap.
- Sebelum layanan publik, tambahkan pengujian konten/penyalahgunaan. Generator riset ini belum mempunyai safety classifier yang tervalidasi; simpan hasil sebagai eksperimen internal dahulu.

Tes teknis: `python -m unittest test_cgan`. Tes memakai data sintetis sendiri, memeriksa pembaruan bobot G/D, conditioning teks, kedua jalur input, checkpoint/resume, evaluasi holdout, hak data, dan kebocoran split. Tes tidak melatih model pakaian nyata.
