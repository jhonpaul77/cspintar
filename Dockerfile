# Menggunakan node:alpine sebagai base image (lebih ringan)
FROM node:16-alpine

# Menetapkan direktori kerja di dalam container
WORKDIR /app

# Menyalin file package.json dan package-lock.json (jika ada) terlebih dahulu
COPY package*.json ./

# Menginstal dependensi aplikasi
RUN npm install

# Menyalin seluruh kode sumber aplikasi ke dalam container
COPY . .

# Menyalin file .env ke dalam container
COPY .env .env

# Expose port yang digunakan oleh aplikasi (3000)
EXPOSE 3000

# Perintah untuk menjalankan aplikasi
CMD ["node", "server.js"]
