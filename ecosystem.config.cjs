module.exports = {
  apps: [
    {
      name: 'coffee-note',
      script: 'dist/index.js',
      cwd: __dirname,
      // 로그인 시도 제한이 메모리 저장소라 단일 프로세스로만 실행한다
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '300M',
      time: true,
      // process.loadEnvFile()은 이미 있는 환경변수를 덮어쓰지 않으므로 PORT는 이 값이 우선한다
      env: {
        NODE_ENV: 'production',
        PORT: 3070,
      },
    },
  ],
}
