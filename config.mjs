export default {
  server: {
    port: process.env.PORT || 3001,
  },
  cors: {
    whitelist: ['http://localhost:5173'],
  },
  ocr: {
    language: 'por',
  },
  auth: {
    username: 'nhce',
    password: 'nhce',
  },
};
