<div align="center">

# 📺 G-TV

### Dois catálogos. Uma experiência.

Câmeras masculinas do Brasil no Nuvio e no Stremio.

CAM4 Brasil · Stripchat Brasil

</div>

---

## ✨ Sobre o projeto

O G-TV reúne as implementações dos addons NuvioCam4 e StripNuvio em um único addon, mantendo os catálogos separados e a lógica de reprodução de cada plataforma.

O objetivo é oferecer uma experiência simples: encontrar uma câmera, abrir seus detalhes e assistir à transmissão.

> 🔞 Projeto destinado exclusivamente a maiores de 18 anos. Os serviços de origem podem apresentar conteúdo sexual explícito.

## 🎯 Recursos

- 📂 Dois catálogos independentes: CAM4 Brasil e Stripchat Brasil.
- 🇧🇷 Listagem de câmeras masculinas com filtro de país para o Brasil.
- 🔎 Busca por nome dentro de cada catálogo.
- 📄 Paginação dos resultados.
- 🖼️ Miniaturas das câmeras utilizadas também como imagens de fundo.
- 📺 Conteúdo organizado no tipo `tv`.
- 🧩 Sem filtros adicionais de gênero.
- 🎨 Ícone personalizável pelo arquivo `logo.png`.

A seleção brasileira utiliza os dados de país informados pelas APIs de origem. Ela pode não corresponder exatamente às categorias exibidas nos respectivos sites.

## 🗂️ Catálogos

| Catálogo | Conteúdo |
|---|---|
| CAM4 Brasil | Câmeras masculinas identificadas como brasileiras na listagem do CAM4. |
| Stripchat Brasil | Câmeras masculinas identificadas como brasileiras na listagem do Stripchat. |

Os nomes e as imagens são obtidos dos serviços de origem e podem mudar conforme a disponibilidade das transmissões.

## ⚙️ Como funciona

O G-TV utiliza o protocolo de addons do Stremio para fornecer três recursos:

| Recurso | Função |
|---|---|
| `catalog` | Lista as câmeras de cada catálogo. |
| `meta` | Fornece nome, imagens e informações da câmera. |
| `stream` | Disponibiliza as opções de reprodução. |

### CAM4

A implementação consulta a listagem de câmeras, filtra os perfis brasileiros e obtém a URL de reprodução pelo endpoint de informações da transmissão.

As miniaturas são disponibilizadas por uma rota de imagem do próprio addon.

### Stripchat

A implementação consulta a listagem masculina e aplica o filtro Brasil.

A reprodução utiliza o proxy de playlists e o tratamento MOUFLON herdados do StripNuvio. Os detalhes da câmera priorizam a imagem já conhecida pelo catálogo, mantendo a mesma imagem na miniatura e no background.

## 📁 Estrutura do projeto

```text
G-TV/
├── index.js
├── cam4.js
├── stripchat.js
├── package.json
├── package-lock.json
├── test.js
└── logo.png
```

| Arquivo | Descrição |
|---|---|
| `index.js` | Servidor, manifesto unificado e encaminhamento das requisições. |
| `cam4.js` | Catálogo, metadados, reprodução e imagens do CAM4. |
| `stripchat.js` | Catálogo, metadados, imagens e proxy de reprodução do Stripchat. |
| `package.json` | Dependências e comandos do projeto. |
| `package-lock.json` | Registro das versões das dependências instaladas. |
| `test.js` | Testes locais com respostas simuladas. |
| `logo.png` | Ícone do addon, adicionado separadamente. |

O `logo.png` é opcional para iniciar o servidor. Enquanto ele não existir, o ícone personalizado ficará indisponível. O `test.js` é necessário somente para executar os testes incluídos no projeto.

## 🚀 Executar localmente

### Requisitos

- Node.js 22 ou superior.
- npm.
- Acesso à internet para consultar os serviços de origem.

### Instalar as dependências

Na pasta do projeto:

```bash
npm install
```

### Verificar a sintaxe

```bash
npm run check
```

### Executar os testes

Se o arquivo `test.js` estiver presente:

```bash
npm test
```

Os testes usam respostas simuladas. Eles não comprovam a disponibilidade atual das APIs nem substituem um teste real de reprodução.

### Iniciar no próprio dispositivo

```bash
PUBLIC_URL="http://127.0.0.1:7000" PORT=7000 npm start
```

Manifesto local:

```text
http://127.0.0.1:7000/manifest.json
```

Esse endereço é destinado ao teste no mesmo dispositivo em que o servidor está sendo executado. O comando acima pode ser utilizado no Termux.

## 🔧 Configuração

| Variável | Função |
|---|---|
| `PUBLIC_URL` | Endereço base pelo qual o cliente acessará o addon. |
| `PORT` | Porta do servidor. O padrão local é `7000`. |

### Atenção ao endereço

`PUBLIC_URL` precisa ser acessível pelo dispositivo que executa o Nuvio ou o Stremio.

Para acessar o servidor a partir de outro dispositivo na mesma rede, use o endereço de rede do aparelho que executa o G-TV:

```bash
PUBLIC_URL="http://IP-DO-SERVIDOR:7000" PORT=7000 npm start
```

Substitua `IP-DO-SERVIDOR` pelo IP real.

Não acrescente `/manifest.json` ao valor de `PUBLIC_URL`. Esse caminho é utilizado apenas no endereço de instalação do addon.

Reinicie o servidor após mudar sua configuração.

## 🧩 Adicionar ao cliente

Na opção de instalar addon por URL do Nuvio ou do Stremio, informe o endereço base do servidor seguido de `/manifest.json`.

Exemplo para uso no mesmo dispositivo:

```text
http://127.0.0.1:7000/manifest.json
```

O servidor precisa permanecer em execução e acessível durante o uso. Ao testar uma nova instalação, evite confundi-la com outra versão do G-TV já adicionada ao cliente.

## 🎨 Ícone personalizado

Para definir o ícone:

1. Prepare uma imagem PNG, preferencialmente quadrada.
2. Salve com o nome exato `logo.png`.
3. Coloque o arquivo na mesma pasta de `index.js`.

O manifesto já aponta para `/logo.png`.

## 🛠️ Diagnóstico

### As câmeras aparecem, mas as imagens não

Confira se `PUBLIC_URL` aponta para o servidor correto e se a URL de uma imagem abre no navegador.

### As miniaturas aparecem, mas o background não

Confira a resposta de metadados da câmera e verifique se os campos `poster` e `background` apontam para a mesma imagem. A versão atual prioriza o preview já obtido pelo catálogo do Stripchat.

### O vídeo não inicia

Consulte os logs do terminal, confira o endereço público anunciado pelo addon e verifique se a câmera continua disponível na plataforma de origem.

### Alterei o código, mas nada mudou

Reinicie o processo do servidor. Se necessário, atualize ou reabra o addon no cliente para evitar o uso de respostas anteriores.

## ⚠️ Limitações

- A disponibilidade das câmeras depende das plataformas de origem.
- APIs, CDNs e formatos de playlist podem mudar sem aviso.
- A listagem tem limites de coleta e pode não incluir todas as câmeras disponíveis.
- O comportamento de imagens e reprodução pode variar entre clientes e dispositivos.
- O addon não concede acesso a transmissões privadas, pagas ou restritas.
- O G-TV não hospeda as transmissões de origem, mas pode intermediar requisições de imagens e playlists.
- A exposição pública do servidor exige atenção a segurança, limites de uso e consumo de recursos.

## 🤝 Autoria e colaboração

### Dudu Martins

Idealização do G-TV, definição dos requisitos, fornecimento das implementações NuvioCam4 e StripNuvio, testes em dispositivos reais e validação dos ajustes.

### Perplexity — assistência de IA

Participação na integração dos dois addons, organização dos provedores, elaboração de código e documentação, além de apoio no diagnóstico e na correção dos problemas encontrados durante os testes.

O projeto foi desenvolvido de forma iterativa, com os testes e o feedback de Dudu Martins orientando os ajustes.

## 📌 Aviso

Projeto independente, sem afiliação oficial com CAM4, Stripchat, Nuvio ou Stremio.

As marcas e os conteúdos pertencem aos respectivos titulares. Utilize o addon respeitando a legislação aplicável e os termos das plataformas envolvidas.

---

<div align="center">

📺 G-TV · CAM4 Brasil + Stripchat Brasil

</div>
