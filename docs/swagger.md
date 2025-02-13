
Penjelasan Swagger JSON:
/start-session:
POST: Memulai sesi WhatsApp baru dan memberikan QR Code untuk scan.
Menggunakan body parameter untuk menerima nomor telepon.

/send-message:
POST: Endpoint untuk mengirim pesan WhatsApp ke nomor tertentu.
Menggunakan body parameter untuk menerima nomor telepon, nomor tujuan, dan pesan.

/chat-history:
GET: Mengambil chat history berdasarkan nomor telepon yang disertakan dalam query parameter phoneNumber.
Mengembalikan array berisi pesan-pesan yang dikirim atau diterima berdasarkan nomor yang diberikan.

/delete-session:
POST: Menghapus sesi WhatsApp untuk nomor yang diberikan.
Menggunakan body parameter untuk menerima nomor telepon.