export default {
  server: {
    port: process.env.PORT || 3001,
  },
  cors: {
    whitelist: ['http://localhost:5173', 'http://localhost:3001', 'https://pdfcreate12.onrender.com'],
  },
  ocr: {
    language: 'por',
    apiKey: 'K89731482388957',
  },
  auth: {
    username: 'nhce',
    password: 'nhce',
  },
};
