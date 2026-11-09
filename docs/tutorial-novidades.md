# Tutorial das novidades — 2026.11.08.1

O player das Novidades usa os arquivos `jacoby-novidades-2026-11-08-neural-v3` em `public/updates`: MP4 com AAC, WebM com Opus e legendas WebVTT. O arquivo JPG mantém a capa. A geração é local, sem API de voz paga, sem gravação de pessoas e sem dados reais de clientes.

A narração foi gerada em português brasileiro com a voz sintética `pf_dora`, velocidade de síntese 1,5×, usando [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) e a exportação do projeto [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx). Licenças: pesos Apache-2.0; runtime kokoro-onnx MIT. As dependências de geração foram instaladas em um ambiente temporário, separado do aplicativo.

Roteiro, geração e versões anteriores ficam no workspace `output/video-novidades`; `gerar_voz_neural.py` reaproveita as cenas de `criar_video.py`, gera a voz e reconstrói vídeo e legendas com novos tempos. O tutorial atualizado dura aproximadamente 1min40s. Os arquivos anteriores foram preservados para comparação.

O vídeo só inicia pelos controles nativos. Fechar a janela pausa e descarrega o player. O efeito de montagem restaura a fonte após replay de efeitos/HMR, sem autoplay. Quando há suporte declarado pelo navegador, o player escolhe WebM/Opus; caso contrário, usa MP4/AAC.

Validação desta versão: decodificação integral de vídeo/áudio e níveis de áudio; testes de manifesto, caminhos de mídia, controles nativos, fechamento e restauração após replay de efeitos. Não foi reproduzido som automaticamente no computador durante a substituição da voz. A preferência de timbre deve ser avaliada pelo usuário com a amostra.
