export function previewFailure(status:number, payload:unknown):string {
  const data=payload as {detail?:{code?:string;detail_number?:number}} | null;
  const code=data?.detail?.code;
  const n=data?.detail?.detail_number;
  const detail=typeof n === "number" && Number.isInteger(n) && n>0 && n<=8?` untuk detail ${n}`:"";
  if(code==="IMAGE_CHECK_REJECTED")return `Instruksi${detail} sudah diterima, tetapi gambar hasil model tidak lolos pemeriksaan gambar sehingga tidak ditampilkan. Ini bukan berarti deskripsimu ditolak. Hasil pemeriksaan tidak menyatakan deskripsimu salah; lanjutkan konsultasi dengan penjahit menggunakan foto dan penanda tersimpan.`;
  if(code==="SYSTEM_MEMORY")return "RAM sistem tidak mencukupi untuk memuat model. Tutup game dan aplikasi berat, lalu coba lagi; foto dan detail tersimpan.";
  if(code==="GPU_MEMORY")return "Memori GPU tidak mencukupi untuk membuat gambar. Tutup aplikasi yang memakai GPU lalu coba kembali; detail dan foto tetap tersimpan.";
  if(code==="CONTROLNET_NOT_READY")return "Model ControlNet belum siap. Jalankan pengunduh ControlNet lalu restart worker AI; foto dan penanda tetap tersimpan.";
  if(code==="PROMPT_TRANSLATION_FAILED")return "Deskripsi tersimpan, tetapi penerjemahan instruksi untuk model belum berhasil. Coba kembali atau konsultasikan dengan penjahit.";
  if(code==="MODEL_NOT_READY"||status===503)return "Instruksi diterima, tetapi model atau berkas pendukung pratinjau belum siap. Jalankan worker AI dan periksa kesiapan model.";
  if(code==="INVALID_EDIT_AREA")return "Instruksi diterima, tetapi area edit tidak dapat diproses. Pastikan setiap detail memiliki coretan yang belum seluruhnya dihapus, lalu simpan penandanya.";
  return "Instruksi diterima, tetapi pembuatan gambar gagal. Analisis teks dapat tetap tersedia. Model belum menjamin penambahan detail; gunakan foto dan penanda untuk konsultasi penjahit.";
}
