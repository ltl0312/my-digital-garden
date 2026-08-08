module.exports = {
  apps: [
    {
      name: 'digital-garden',
      port: '3000',
      exec_mode: 'cluster',
      instances: 'max',
      script: './.output/server/index.mjs',
      env: {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://garden_user:SecureProdPassword987!@localhost:5432/garden_db?schema=public'
      }
    }
  ]
}
