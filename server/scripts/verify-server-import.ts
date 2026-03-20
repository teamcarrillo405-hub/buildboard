import('../index.js')
  .then(() => {
    console.log('Server imports OK');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Server import FAILED:', err);
    process.exit(1);
  });
