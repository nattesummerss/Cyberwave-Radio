# Correção ANDRA-18 — boca natural e respiração suave

- `public/assets/host.png`: nova still frontal ampliada em 1,5×.
- `public/assets/host_closed.png`: frame auxiliar de piscada, calibrado na mesma imagem.
- `public/assets/mouth_visemes.png`: seis quadros gerados a partir da textura real dos lábios da própria host.
- `public/host-rig.js`: rig de âncora compatível com `window.CyberwaveRig`.
- Olhos: centros (436,5; 515,5) e (588,5; 519,5).
- Boca: centro (514; 660).

O rig anterior de corpo inteiro foi removido porque utilizava regiões da primeira imagem e deslocava boca e olhos. A boca sintética desenhada por elipses também foi removida: a fala agora interpola os visemas reais, com abertura limitada para evitar o efeito de “adesivo cartunesco”.

A respiração usa ciclo de **4,25 s**, elevação de aproximadamente **1,7 px** e expansão sutil. O ajuste fica disponível em `CyberwaveRig.config.breathAmount` (padrão `1`).
