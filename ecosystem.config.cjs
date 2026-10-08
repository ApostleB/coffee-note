module.exports = {
  apps: [
    {
      name: 'coffee-note',
      script: 'dist/index.js',
      cwd: __dirname,
      // 로그인 시도 제한이 메모리 저장소라 단일 프로세스로만 실행한다
      exec_mode: 'fork',
      instances: 1,
      // 업로드는 메모리 버퍼(최대 300MB)에 쌓이므로 한도를 그보다 넉넉히 둬서 요청 도중 재시작되지 않게 한다
      max_memory_restart: '1G',
      time: true,
      // process.loadEnvFile()은 이미 있는 환경변수를 덮어쓰지 않으므로 PORT는 이 값이 우선한다
      env: {
        NODE_ENV: 'production',
        PORT: 3070,
      },
    },
  ],
}
