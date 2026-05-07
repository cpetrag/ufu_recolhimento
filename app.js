var BASE_CSV_URL = "https://custodioufu.netlify.app/base.csv";

var EMPRESAS_MAP = {
    "15": "HC",
    "45": "UFU",
    "46": "FAEPU",
    "47": "FAU",
    "52": "FUNDAP"
};
var EMPRESA_PADRAO = "UFU";

var AVALIACOES_LABEL = {
    REUSO: "Reuso",
    LAUDO_TECNICO: "Laudo Técnico",
    DESCARTE: "Descarte"
};

function formatarAvaliacao(valor) {
    if (!valor) return "—";
    return AVALIACOES_LABEL[valor] || valor;
}

function app() {
    return {
        // ── estado geral ──────────────────────────────
        aba: "processo",
        campus: [], blocos: [], itens: [],
        baseCSV: [], csvCarregando: true, csvCarregado: false, csvErro: null,
        unidades_db: [],
        processoId: null, loading: false, exportando: false,
        buscaSei: "", patrimonioNaoEncontrado: false,
        processo: { sei: "", pro_reitoria_unidade: "", campus_id: "", bloco_id: "", sala: "" },
        item: { patrimonio: "", descricao: "", tamanho: "", viavel: false, bvm: false, foto: "", semPatrimonio: false, avaliacao: "" },

        // ── aba processos ─────────────────────────────
        processosList: [], processosCarregando: false, processosErro: null,
        processosFiltro: "", processosFiltroAno: "", processosAnos: [],

        // ── seleção múltipla ──────────────────────────
        selecionados: [],       // ids selecionados via checkbox
        seiManual: "",          // campo de texto para digitar SEIs
        exportandoSelecionados: false,

        // ── busca global ──────────────────────────────
        buscaGlobal: "", buscaGlobalResultados: [], buscaGlobalCarregando: false, buscaGlobalFeita: false,

        // ── aba classificação prévia ──────────────────
        buscaSeiClassif: "",
        classifProcesso: null,
        classifItens: [],
        classifFiltro: "pendentes",
        classifCarregando: false,
        classifErro: null,
        classifGerando: false,

        // ── edição de item ────────────────────────────
        itemEditando: null,
        itemEditForm: { patrimonio: "", descricao: "", tamanho: "", viavel: false, bvm: false, foto: "", avaliacao: "" },
        itemEditNovaFoto: false,
        itemEditAutoStatus: "",
        _itemEditAutoSaveTimer: null,
        atalhoToast: "",
        _atalhoToastTimer: null,

        // ── backup ────────────────────────────────────
        backupStats: null,
        backupCarregandoStats: false,
        backupExportando: false,
        backupExportandoZIP: false,
        backupIncluirFotos: true,
        backupArquivo: null,
        backupArquivoConteudo: null,
        backupArquivoErro: null,
        backupRestaurando: false,
        backupConfirmacao: "",
        backupResultado: null,
        backupAutoEnviando: false,
        backupAutoMensagem: null,

        // =============================================
        // INIT
        // =============================================
        init: function() {
            var self = this;
            API.carregarCampus().then(function(data) { self.campus = data; });
            API.carregarUnidades().then(function(data) { self.unidades_db = data; });
            this.carregarBaseCSV();
            this._keyHandler = function(e) { self.handleAtalhosItens(e); };
            window.addEventListener("keydown", this._keyHandler);
        },

        // =============================================
        // BASE CSV (Netlify)
        // =============================================
        carregarBaseCSV: function() {
            var self = this;
            this.csvCarregando = true; this.csvCarregado = false; this.csvErro = null;
            fetch(BASE_CSV_URL)
                .then(function(res) {
                    if (!res.ok) throw new Error("CSV não encontrado: " + res.status);
                    return res.text();
                })
                .then(function(texto) {
                    var r = Papa.parse(texto, { header: true, skipEmptyLines: true });
                    if (r.errors.length > 0) throw new Error("Erro ao ler CSV");
                    var raw = r.data;
                    var campos = r.meta.fields || (raw[0] ? Object.keys(raw[0]) : []);
                    var map = self._mapearColunas(campos);
                    self.baseCSV = raw.map(function(linha) {
                        return {
                            NroPatrimonio: self._valor(linha, map.NroPatrimonio),
                            CodioBarra:    self._valor(linha, map.CodioBarra),
                            DescricaoBem:  self._valor(linha, map.DescricaoBem),
                            Empresa:       self._valor(linha, map.Empresa)
                        };
                    }).filter(function(l) { return l.NroPatrimonio !== undefined || l.CodioBarra !== undefined; });
                    self.csvCarregando = false; self.csvCarregado = true;
                })
                .catch(function(err) {
                    self.csvCarregando = false;
                    self.csvErro = err && err.message ? err.message : "Erro ao carregar base";
                });
        },

        _mapearColunas: function(campos) {
            var nro     = ["NroPatrimonio","Nro Patrimônio","Patrimônio","Numero","Número","Nro"];
            var cod     = ["CodioBarra","CodigoBarra","Código de Barras","Codigo Barras"];
            var desc    = ["DescricaoBem","Descrição do Bem","Descricao","Descrição"];
            var empresa = ["Empresa","CodEmpresa","Codigo Empresa","Código Empresa","Cod Empresa"];

            function acharExato(lista) {
                for (var i = 0; i < campos.length; i++) {
                    var c = (campos[i]||"").replace(/\uFEFF/g,"").trim();
                    for (var j = 0; j < lista.length; j++) {
                        if (c.toLowerCase() === lista[j].toLowerCase()) return campos[i];
                    }
                }
                return null;
            }
            function acharPorRegex(regex) {
                for (var i = 0; i < campos.length; i++) {
                    var c = (campos[i]||"").replace(/\uFEFF/g,"").trim();
                    if (regex.test(c)) return campos[i];
                }
                return null;
            }

            return {
                NroPatrimonio: acharExato(nro)     || acharPorRegex(/patrim|numero|nro/i) || campos[0] || null,
                CodioBarra:    acharExato(cod)     || acharPorRegex(/codigo|barra/i)      || campos[1] || null,
                DescricaoBem:  acharExato(desc)    || acharPorRegex(/descri/i)             || campos[2] || null,
                Empresa:       acharExato(empresa) || acharPorRegex(/empresa|orgao|órgão|unidade.*gestora/i) || null
            };
        },

        _valor: function(linha, chave) {
            if (!chave) return undefined;
            var v = linha[chave];
            return v !== undefined && v !== null ? String(v).trim() : undefined;
        },

        formatarAvaliacaoTexto: function(valor) {
            return formatarAvaliacao(valor);
        },

        resolverEmpresa: function(item) {
            if (!item) return EMPRESA_PADRAO;
            var semPatrimonio = !!item.bvm
                || item.semPatrimonio === true
                || item.patrimonio === "Sem número"
                || item.patrimonio === "SEM PATRIMONIO";
            if (semPatrimonio) return EMPRESA_PADRAO;

            if (!this.baseCSV || this.baseCSV.length === 0) return EMPRESA_PADRAO;

            var v = String(item.patrimonio || "").trim();
            if (!v) return EMPRESA_PADRAO;
            var vNum = parseInt(v, 10);

            var achado = this.baseCSV.find(function(b) {
                var nroPat = parseInt(String(b.NroPatrimonio || "").trim(), 10);
                var codBar = parseInt(String(b.CodioBarra || "").trim(), 10);
                if (!isNaN(nroPat) && nroPat === vNum) return true;
                if (!isNaN(codBar) && codBar !== 0 && codBar === vNum) return true;
                if (String(b.NroPatrimonio || "").trim() === v) return true;
                if (String(b.CodioBarra || "").trim() === v) return true;
                return false;
            });

            if (!achado || !achado.Empresa) return EMPRESA_PADRAO;
            var cod = String(achado.Empresa).trim();
            return EMPRESAS_MAP[cod] || EMPRESA_PADRAO;
        },

        // =============================================
        // ABA PROCESSO
        // =============================================
        carregarBlocos: function() {
            var self = this;
            API.carregarBlocos(this.processo.campus_id).then(function(data) { self.blocos = data; });
        },

        buscarProcessoExistente: function() {
            var self = this;
            API.buscarProcessoPorSEI(this.processo.sei).then(function(data) {
                if (data) {
                    self.processo = data; self.processoId = data.id;
                    self.carregarBlocos();
                    API.carregarItensProcesso(data.id).then(function(itens) { self.itens = itens; });
                    alert("Processo carregado!");
                    self.aba = "itens";
                }
            });
        },

        salvarProcesso: function() {
            var self = this;
            if (!this.processo.sei || this.processo.sei.length < 20) { alert("Preencha o Número SEI corretamente."); return; }
            if (!this.processo.pro_reitoria_unidade) { alert("Preencha a Pró-Reitoria / Unidade."); return; }
            if (!this.processo.campus_id) { alert("Selecione o Campus."); return; }
            if (!this.processo.sala) { alert("Preencha a Sala/Espaço."); return; }
            API.salvarProcesso(this.processo).then(function(data) {
                self.processoId = data.id; self.processo = data; self.aba = "itens";
            });
        },

        // =============================================
        // ABA ITENS
        // =============================================
        buscarPatrimonio: function() {
            var v = String(this.item.patrimonio).trim();
            if (!v) { this.item.descricao = ""; this.patrimonioNaoEncontrado = false; return; }
            if (!this.csvCarregado || this.baseCSV.length === 0) { this.patrimonioNaoEncontrado = false; return; }
            var vNum = parseInt(v, 10);
            var achado = this.baseCSV.find(function(i) {
                var nroPat = parseInt(String(i.NroPatrimonio||"").trim(), 10);
                var codBar = parseInt(String(i.CodioBarra||"").trim(), 10);
                if (!isNaN(nroPat) && nroPat === vNum) return true;
                if (!isNaN(codBar) && codBar !== 0 && codBar === vNum) return true;
                if (String(i.NroPatrimonio||"").trim() === v || String(i.CodioBarra||"").trim() === v) return true;
                return false;
            });
            this.item.descricao = achado ? (achado.DescricaoBem || "") : "";
            this.patrimonioNaoEncontrado = !achado;
        },

        capturarFoto: function(e) {
            var self = this;
            var file = e.target.files[0];
            if (file) API.processarFoto(file).then(function(foto) { self.item.foto = foto; });
        },

        _extrairImagemClipboard: function(items, onImage) {
            if (!items) return false;
            for (var i = 0; i < items.length; i++) {
                if (items[i].type && items[i].type.indexOf("image") !== -1) {
                    var blob = items[i].getAsFile ? items[i].getAsFile() : null;
                    if (blob) {
                        onImage(blob);
                        return true;
                    }
                }
            }
            return false;
        },

        colarFoto: function(e) {
            var self = this;
            var items = e.clipboardData && e.clipboardData.items;
            if (!items) { alert("Navegador não suporta colar imagens."); return; }
            var ok = this._extrairImagemClipboard(items, function(blob) {
                API.processarFoto(blob).then(function(foto) { self.item.foto = foto; });
            });
            if (ok) return;
            alert("Nenhuma imagem encontrada. Copie uma imagem primeiro e depois cole aqui (Ctrl+V).");
        },

        colarFotoBtn: function() {
            var self = this;
            if (!navigator.clipboard || !navigator.clipboard.read) { alert("Clique nesta área e use Ctrl+V para colar a imagem."); return; }
            navigator.clipboard.read().then(function(items) {
                for (var i = 0; i < items.length; i++) {
                    var types = items[i].types;
                    for (var j = 0; j < types.length; j++) {
                        if (types[j].indexOf("image") !== -1) {
                            items[i].getType(types[j]).then(function(blob) {
                                API.processarFoto(blob).then(function(foto) { self.item.foto = foto; });
                            });
                            return;
                        }
                    }
                }
                alert("Nenhuma imagem na área de transferência. Copie uma imagem e tente novamente.");
            }).catch(function() { alert("Sem permissão para acessar clipboard. Clique nesta área e use Ctrl+V."); });
        },

        colarFotoEdicao: function(e) {
            var self = this;
            var items = e.clipboardData && e.clipboardData.items;
            if (!items) { alert("Navegador não suporta colar imagens."); return; }
            var ok = this._extrairImagemClipboard(items, function(blob) {
                API.processarFoto(blob).then(function(foto) {
                    self.itemEditForm.foto = foto;
                    self.itemEditNovaFoto = true;
                    self.agendarAutoSaveEdicao();
                });
            });
            if (ok) return;
            alert("Nenhuma imagem encontrada. Copie uma imagem primeiro e depois cole aqui (Ctrl+V).");
        },

        colarFotoEdicaoBtn: function() {
            var self = this;
            if (!navigator.clipboard || !navigator.clipboard.read) { alert("Clique nesta área e use Ctrl+V para colar a imagem."); return; }
            navigator.clipboard.read().then(function(items) {
                for (var i = 0; i < items.length; i++) {
                    var types = items[i].types;
                    for (var j = 0; j < types.length; j++) {
                        if (types[j].indexOf("image") !== -1) {
                            items[i].getType(types[j]).then(function(blob) {
                                API.processarFoto(blob).then(function(foto) {
                                    self.itemEditForm.foto = foto;
                                    self.itemEditNovaFoto = true;
                                    self.agendarAutoSaveEdicao();
                                });
                            });
                            return;
                        }
                    }
                }
                alert("Nenhuma imagem na área de transferência. Copie uma imagem e tente novamente.");
            }).catch(function() { alert("Sem permissão para acessar clipboard. Clique nesta área e use Ctrl+V."); });
        },

        _focoDescricaoInclusao: function() {
            if (this.$refs && this.$refs.campoDescricao) {
                this.$nextTick(function() { this.$refs.campoDescricao.focus(); }.bind(this));
            }
        },

        _focoDescricaoEdicao: function() {
            if (this.$refs && this.$refs.campoDescricaoEdicao) {
                this.$nextTick(function() { this.$refs.campoDescricaoEdicao.focus(); }.bind(this));
            }
        },

        _isCampoTextoAtivo: function() {
            var el = document.activeElement;
            if (!el) return false;
            var tag = (el.tagName || "").toLowerCase();
            if (el.isContentEditable) return true;
            return tag === "input" || tag === "textarea" || tag === "select";
        },

        _getContextoAtalho: function() {
            if (this.itemEditando !== null) return this.itemEditForm;
            return this.item;
        },

        _aplicarAtalhoTamanho: function(key, alvo) {
            var mapa = { p: "P", m: "M", g: "G", x: "GG" };
            if (!mapa[key]) return false;
            alvo.tamanho = mapa[key];
            this.mostrarAtalhoToast("Tamanho: " + mapa[key]);
            return true;
        },

        _aplicarAtalhoFlags: function(key, alvo) {
            if (key === "0") {
                alvo.viavel = !alvo.viavel;
                this.mostrarAtalhoToast("Viável: " + (alvo.viavel ? "Sim" : "Não"));
                return true;
            }
            if (key === "1") {
                alvo.bvm = !alvo.bvm;
                this.mostrarAtalhoToast("BVM: " + (alvo.bvm ? "Ativado" : "Desativado"));
                if (alvo.bvm) {
                    if (this.itemEditando !== null) this._focoDescricaoEdicao();
                    else this._focoDescricaoInclusao();
                }
                return true;
            }
            return false;
        },

        _aplicarAtalhoAvaliacao: function(key, alvo) {
            var mapa = { r: "REUSO", l: "LAUDO_TECNICO", d: "DESCARTE" };
            if (!mapa[key]) return false;
            alvo.avaliacao = mapa[key];
            this.mostrarAtalhoToast("Avaliação: " + AVALIACOES_LABEL[mapa[key]]);
            return true;
        },

        _indiceItemEditando: function() {
            if (this.itemEditando === null) return -1;
            return this.itens.findIndex(function(x) { return x.id === this.itemEditando; }.bind(this));
        },

        _itemEditandoAtual: function() {
            var idx = this._indiceItemEditando();
            if (idx === -1) return null;
            return this.itens[idx];
        },

        get itemEmEdicaoAtual() {
            return this._itemEditandoAtual();
        },

        _temMudancaEdicao: function(itemAtual) {
            if (!itemAtual) return false;
            if (String(this.itemEditForm.descricao || "") !== String(itemAtual.descricao || "")) return true;
            if (String(this.itemEditForm.tamanho || "") !== String(itemAtual.tamanho || "")) return true;
            if (!!this.itemEditForm.viavel !== !!itemAtual.viavel) return true;
            if (!!this.itemEditForm.bvm !== !!itemAtual.bvm) return true;
            if (String(this.itemEditForm.avaliacao || "") !== String(itemAtual.avaliacao || "")) return true;
            if (this.itemEditNovaFoto) return true;
            return false;
        },

        onCampoEdicaoAlterado: function() {
            if (this.itemEditando === null) return;
            this.agendarAutoSaveEdicao();
        },

        agendarAutoSaveEdicao: function() {
            if (this.itemEditando === null) return;
            if (this._itemEditAutoSaveTimer) clearTimeout(this._itemEditAutoSaveTimer);
            this.itemEditAutoStatus = "Alterações pendentes...";
            var self = this;
            this._itemEditAutoSaveTimer = setTimeout(function() {
                self._itemEditAutoSaveTimer = null;
                var atual = self._itemEditandoAtual();
                if (!atual) return;
                self.salvarEdicaoItem(atual, { manterAberto: true, silencioso: true, origem: "auto" });
            }, 650);
        },

        abrirEdicaoItemAnterior: function() {
            var idx = this._indiceItemEditando();
            if (idx <= 0) return;
            var self = this;
            var atual = this.itens[idx];
            var destino = this.itens[idx - 1];
            this.salvarEdicaoItem(atual, { manterAberto: true, silencioso: true, origem: "navegacao" }).then(function(ok) {
                if (ok === false) return;
                self.abrirEdicaoItem(destino);
                self._focoDescricaoEdicao();
                self.mostrarAtalhoToast("Item anterior");
            });
        },

        abrirEdicaoItemProximo: function() {
            var idx = this._indiceItemEditando();
            if (idx === -1 || idx >= this.itens.length - 1) return;
            var self = this;
            var atual = this.itens[idx];
            var destino = this.itens[idx + 1];
            this.salvarEdicaoItem(atual, { manterAberto: true, silencioso: true, origem: "navegacao" }).then(function(ok) {
                if (ok === false) return;
                self.abrirEdicaoItem(destino);
                self._focoDescricaoEdicao();
                self.mostrarAtalhoToast("Próximo item");
            });
        },

        iniciarInclusaoRapida: function() {
            this.itemEditando = null;
            this.itemEditAutoStatus = "";
            if (this._itemEditAutoSaveTimer) {
                clearTimeout(this._itemEditAutoSaveTimer);
                this._itemEditAutoSaveTimer = null;
            }
            var self = this;
            this.$nextTick(function() {
                if (self.$refs && self.$refs.campoPatrimonio) self.$refs.campoPatrimonio.focus();
            });
            this.mostrarAtalhoToast("Modo inclusão");
        },

        excluirItemEmEdicaoRapido: function() {
            var idx = this._indiceItemEditando();
            if (idx === -1) return;
            var self = this;
            var item = this.itens[idx];
            if (!confirm("Excluir patrimônio " + item.patrimonio + "? Esta ação não pode ser desfeita.")) return;
            API.excluirItem(item.id).then(function() {
                self.itens = self.itens.filter(function(x) { return x.id !== item.id; });
                self.mostrarAtalhoToast("Item excluído");
                if (self.itens.length === 0) {
                    self.itemEditando = null;
                    self.iniciarInclusaoRapida();
                    return;
                }
                var novoIdx = Math.min(idx, self.itens.length - 1);
                self.abrirEdicaoItem(self.itens[novoIdx]);
                self._focoDescricaoEdicao();
            }).catch(function() { alert("Erro ao excluir item."); });
        },

        mostrarAtalhoToast: function(texto) {
            this.atalhoToast = texto;
            if (this._atalhoToastTimer) clearTimeout(this._atalhoToastTimer);
            var self = this;
            this._atalhoToastTimer = setTimeout(function() {
                self.atalhoToast = "";
                self._atalhoToastTimer = null;
            }, 1300);
        },

        handleAtalhosItens: function(e) {
            if (this.aba !== "itens") return;
            if (e.ctrlKey || e.altKey || e.metaKey) return;

            var key = String(e.key || "").toLowerCase();
            if (!key) return;

            if (this.itemEditando !== null && (key === "arrowup" || key === "arrowleft")) {
                e.preventDefault();
                this.abrirEdicaoItemAnterior();
                return;
            }
            if (this.itemEditando !== null && (key === "arrowdown" || key === "arrowright")) {
                e.preventDefault();
                this.abrirEdicaoItemProximo();
                return;
            }
            if (this.itemEditando !== null && key === "delete") {
                e.preventDefault();
                this.excluirItemEmEdicaoRapido();
                return;
            }
            if (key === "n") {
                e.preventDefault();
                this.iniciarInclusaoRapida();
                return;
            }
            if (this._isCampoTextoAtivo()) return;

            var alvo = this._getContextoAtalho();
            if (!alvo) return;

            if (this._aplicarAtalhoTamanho(key, alvo)
                || this._aplicarAtalhoFlags(key, alvo)
                || this._aplicarAtalhoAvaliacao(key, alvo)) {
                e.preventDefault();
                if (this.itemEditando !== null) this.agendarAutoSaveEdicao();
            }
        },

        salvarItem: function() {
            var self = this;
            if (!this.item.patrimonio) { alert("Informe o Nº Patrimônio."); return; }
            if (this.item.patrimonio !== "Sem número") {
                var existe = this.itens.some(function(i) { return String(i.patrimonio) === String(self.item.patrimonio); });
                if (existe) { alert("Este patrimônio já foi cadastrado neste processo."); return; }
            }
            if (this.item.semPatrimonio && !this.item.descricao.trim()) { alert("Informe a descrição do item."); return; }
            if (!this.item.semPatrimonio && !this.item.descricao && !this.item.bvm) { alert("Patrimônio não encontrado. Marque BVM para descrição manual."); return; }
            if (this.item.bvm && !this.item.descricao.trim()) { alert("Informe a descrição (BVM)."); return; }
            if (!this.item.tamanho) { alert("Selecione o Tamanho."); return; }
            if (!this.item.avaliacao) { alert("Selecione a Avaliação (Reuso, Laudo Técnico ou Descarte)."); return; }
            if (!this.item.foto) { alert("Capture a Foto."); return; }
            this.loading = true;
            API.salvarItem(this.item, this.processoId).then(function(salvo) {
                self.itens.unshift(salvo);
                self.item = { patrimonio: "", descricao: "", tamanho: "", viavel: false, bvm: false, foto: "", semPatrimonio: false, avaliacao: "" };
                self.patrimonioNaoEncontrado = false;
                self.loading = false;
            }).catch(function() { self.loading = false; });
        },

        // ── edição de item ────────────────────────────
        abrirEdicaoItem: function(i) {
            if (this._itemEditAutoSaveTimer) {
                clearTimeout(this._itemEditAutoSaveTimer);
                this._itemEditAutoSaveTimer = null;
            }
            this.itemEditando = i.id;
            this.itemEditNovaFoto = false;
            this.itemEditForm = {
                patrimonio: i.patrimonio,
                descricao: i.descricao,
                tamanho: i.tamanho,
                viavel: i.viavel,
                bvm: i.bvm,
                foto: i.foto,
                avaliacao: i.avaliacao || ""
            };
            this.itemEditAutoStatus = "";
        },

        cancelarEdicaoItem: function() {
            if (this._itemEditAutoSaveTimer) {
                clearTimeout(this._itemEditAutoSaveTimer);
                this._itemEditAutoSaveTimer = null;
            }
            this.itemEditAutoStatus = "";
            this.itemEditando = null;
        },

        capturarFotoEdicao: function(e) {
            var self = this;
            var file = e.target.files[0];
            if (file) API.processarFoto(file).then(function(foto) {
                self.itemEditForm.foto = foto;
                self.itemEditNovaFoto = true;
                self.agendarAutoSaveEdicao();
            });
        },

        removerFotoEdicao: function() {
            if (!this.itemEditForm.foto) return;
            this.itemEditForm.foto = "";
            this.itemEditNovaFoto = true;
            this.itemEditAutoStatus = "Foto removida (pendente de salvar)";
            this.agendarAutoSaveEdicao();
        },

        salvarItemEmEdicaoAtual: function(opts) {
            var atual = this._itemEditandoAtual();
            if (!atual) return Promise.resolve(false);
            return this.salvarEdicaoItem(atual, opts || {});
        },

        salvarEdicaoItem: function(i, opts) {
            opts = opts || {};
            var manterAberto = !!opts.manterAberto;
            var silencioso = !!opts.silencioso;
            var self = this;
            var itemAtual = this._itemEditandoAtual() || i;
            if (!itemAtual) return Promise.resolve(false);
            if (!this._temMudancaEdicao(itemAtual)) {
                if (manterAberto) this.itemEditAutoStatus = "Tudo salvo";
                return Promise.resolve(true);
            }
            if (!this.itemEditForm.descricao.trim()) {
                this.itemEditAutoStatus = "Descrição obrigatória";
                if (!silencioso) alert("Informe a descrição.");
                return Promise.resolve(false);
            }
            if (!this.itemEditForm.tamanho) {
                this.itemEditAutoStatus = "Tamanho obrigatório";
                if (!silencioso) alert("Selecione o Tamanho.");
                return Promise.resolve(false);
            }
            var campos = {
                descricao: this.itemEditForm.descricao,
                tamanho: this.itemEditForm.tamanho,
                viavel: this.itemEditForm.viavel,
                bvm: this.itemEditForm.bvm,
                avaliacao: this.itemEditForm.avaliacao || null,
                enviado_sharepoint: false
            };
            if (this.itemEditForm.avaliacao) {
                campos.avaliado_em = new Date().toISOString();
            }
            if (this.itemEditNovaFoto) campos.foto = this.itemEditForm.foto;
            this.loading = true;
            this.itemEditAutoStatus = "Salvando...";
            return API.editarItem(i.id, campos).then(function(atualizado) {
                var idx = self.itens.findIndex(function(x) { return x.id === i.id; });
                if (idx !== -1) self.itens.splice(idx, 1, atualizado);
                self.itemEditNovaFoto = false;
                self.loading = false;
                self.itemEditAutoStatus = "Salvo automaticamente";
                if (!manterAberto) self.itemEditando = null;
                return true;
            }).catch(function() {
                self.loading = false;
                self.itemEditAutoStatus = "Falha ao salvar";
                if (!silencioso) alert("Erro ao salvar edição.");
                return false;
            });
        },

        excluirItemLista: function(i) {
            var self = this;
            if (!confirm("Excluir patrimônio " + i.patrimonio + "? Esta ação não pode ser desfeita.")) return;
            API.excluirItem(i.id).then(function() {
                self.itens = self.itens.filter(function(x) { return x.id !== i.id; });
            }).catch(function() { alert("Erro ao excluir item."); });
        },

        reenviarItemSharePoint: function(i) {
            var self = this;
            if (i._reenviando) return;
            i._reenviando = true;
            self.itens = self.itens.slice();
            API.enviarItemSharePoint(self.processo, i).then(function(r) {
                if (r.ok) {
                    var idx = self.itens.findIndex(function(x) { return x.id === i.id; });
                    if (idx !== -1) self.itens.splice(idx, 1, Object.assign({}, self.itens[idx], { enviado_sharepoint: true, _reenviando: false }));
                } else {
                    alert("Falha ao reenviar item " + i.patrimonio + ".");
                    i._reenviando = false; self.itens = self.itens.slice();
                }
            });
        },

        // =============================================
        // ABA PROCESSOS — lista, filtros, anos
        // =============================================
        carregarListaProcessos: function() {
            var self = this;
            this.processosCarregando = true; this.processosErro = null;
            this.selecionados = []; this.seiManual = "";
            API.listarProcessos().then(function(data) {
                self.processosList = data;
                self.processosCarregando = false;
                var anos = {};
                data.forEach(function(p) {
                    var m = (p.sei || "").match(/\/(\d{4})-/);
                    if (m) anos[m[1]] = true;
                });
                self.processosAnos = Object.keys(anos).sort().reverse();
            }).catch(function() {
                self.processosErro = "Erro ao carregar processos."; self.processosCarregando = false;
            });
        },

        get processosFiltrados() {
            var f   = (this.processosFiltro    || "").toLowerCase().trim();
            var ano = (this.processosFiltroAno || "").trim();
            return this.processosList.filter(function(p) {
                var passaTexto = !f || (
                    (p.sei || "").toLowerCase().includes(f) ||
                    (p.pro_reitoria_unidade || "").toLowerCase().includes(f) ||
                    (p.sala || "").toLowerCase().includes(f)
                );
                var passaAno = !ano || (function() {
                    var m = (p.sei || "").match(/\/(\d{4})-/);
                    return m && m[1] === ano;
                })();
                return passaTexto && passaAno;
            });
        },

        abrirProcessoNaAba: function(p) {
            this.processo = p; this.processoId = p.id;
            this.carregarBlocos();
            var self = this;
            API.carregarItensProcesso(p.id).then(function(itens) { self.itens = itens; });
            this.itemEditando = null; this.aba = "itens";
        },

        excluirProcessoLista: function(p) {
            var self = this;
            if (!confirm("Excluir processo " + p.sei + " e todos os seus " + p.total_itens + " itens? Esta ação não pode ser desfeita.")) return;
            API.excluirProcesso(p.id).then(function() {
                self.processosList = self.processosList.filter(function(x) { return x.id !== p.id; });
                if (self.processoId === p.id) {
                    self.processoId = null;
                    self.processo = { sei: "", pro_reitoria_unidade: "", campus_id: "", bloco_id: "", sala: "" };
                    self.itens = [];
                }
            }).catch(function() { alert("Erro ao excluir processo."); });
        },

        // =============================================
        // SELEÇÃO MÚLTIPLA
        // =============================================
        toggleSelecionado: function(id) {
            var idx = this.selecionados.indexOf(id);
            if (idx === -1) this.selecionados.push(id);
            else this.selecionados.splice(idx, 1);
        },

        isSelecionado: function(id) {
            return this.selecionados.indexOf(id) !== -1;
        },

        selecionarTodosFiltrados: function() {
            var self = this;
            var ids = this.processosFiltrados.map(function(p) { return p.id; });
            var todosJa = ids.every(function(id) { return self.selecionados.indexOf(id) !== -1; });
            if (todosJa) {
                this.selecionados = this.selecionados.filter(function(id) { return ids.indexOf(id) === -1; });
            } else {
                ids.forEach(function(id) { if (self.selecionados.indexOf(id) === -1) self.selecionados.push(id); });
            }
        },

        adicionarSeiManual: function() {
            var self = this;
            var partes = this.seiManual.split(/[,;\n\s]+/).map(function(s) { return s.trim(); }).filter(Boolean);
            partes.forEach(function(sei) {
                var proc = self.processosList.find(function(p) { return (p.sei || "").includes(sei); });
                if (proc && self.selecionados.indexOf(proc.id) === -1) self.selecionados.push(proc.id);
            });
            this.seiManual = "";
        },

        get processosSelecionadosLista() {
            var self = this;
            return this.processosList.filter(function(p) { return self.selecionados.indexOf(p.id) !== -1; });
        },

        limparSelecao: function() { this.selecionados = []; this.seiManual = ""; },

        // =============================================
        // EXPORTAÇÕES — helpers internos
        // =============================================
        _exportarCSV: function(procs) {
            if (procs.length === 0) { alert("Nenhum processo selecionado."); return; }
            var self = this;
            var todas = [];
            Promise.all(procs.map(function(p) {
                return API.carregarItensProcessoCompleto(p.id).then(function(itens) {
                    itens.forEach(function(i) {
                        todas.push({ SEI: p.sei, Unidade: p.pro_reitoria_unidade||"", Sala: p.sala||"",
                            Data: p.created_at ? p.created_at.substring(0,10) : "",
                            Empresa: self.resolverEmpresa(i),
                            Patrimonio: i.patrimonio, Descricao: i.descricao||"", Tamanho: i.tamanho||"",
                            Viavel: i.viavel?"Sim":"Não", BVM: i.bvm?"Sim":"Não",
                            Avaliacao: formatarAvaliacao(i.avaliacao),
                            Situacao: i.situacao||"Ativo", Enviado_SharePoint: i.enviado_sharepoint?"Sim":"Não" });
                    });
                });
            })).then(function() {
                var csv = Papa.unparse(todas);
                var blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
                var url = URL.createObjectURL(blob);
                var a = document.createElement("a"); a.href = url;
                a.download = "Recolhimento_" + new Date().toISOString().substring(0,10) + ".csv";
                a.click(); URL.revokeObjectURL(url);
            });
        },

        _exportarExcel: function(procs) {
            if (procs.length === 0) { alert("Nenhum processo selecionado."); return; }
            var self = this;
            var todas = [];
            Promise.all(procs.map(function(p) {
                return API.carregarItensProcessoCompleto(p.id).then(function(itens) {
                    itens.forEach(function(i) {
                        todas.push([p.sei, p.pro_reitoria_unidade||"", p.sala||"",
                            p.created_at ? p.created_at.substring(0,10) : "",
                            self.resolverEmpresa(i),
                            i.patrimonio, i.descricao||"", i.tamanho||"",
                            i.viavel?"Sim":"Não", i.bvm?"Sim":"Não",
                            formatarAvaliacao(i.avaliacao),
                            i.situacao||"Ativo", i.enviado_sharepoint?"Sim":"Não"]);
                    });
                });
            })).then(function() {
                var XLS = window.XLSX;
                var wb = XLS.utils.book_new();
                var cab = [["SEI","Unidade","Sala","Data","Empresa","Patrimônio","Descrição","Tamanho","Viável","BVM","Avaliação","Situação","Enviado SharePoint"]];
                var ws = XLS.utils.aoa_to_sheet(cab.concat(todas));
                ws["!cols"] = [22,30,30,12,12,16,40,10,8,8,16,16,18].map(function(w){return{wch:w};});
                XLS.utils.book_append_sheet(wb, ws, "Recolhimento");
                XLS.writeFile(wb, "Recolhimento_" + new Date().toISOString().substring(0,10) + ".xlsx");
            });
        },

        _exportarPDFConsolidado: function(procs, nomeArquivo) {
            var self = this;
            if (procs.length === 0) { alert("Nenhum processo selecionado."); return; }
            this.exportandoSelecionados = true;
            var jsPDF = window.jspdf.jsPDF;
            var doc = new jsPDF("p", "mm", "a4");
            var pw = doc.internal.pageSize.getWidth();
            var IPP = 5, primeiro = true;
            function proximo(idx) {
                if (idx >= procs.length) {
                    doc.save((nomeArquivo || "Recolhimento") + "_" + new Date().toISOString().substring(0,10) + ".pdf");
                    self.exportandoSelecionados = false; self.exportando = false; return;
                }
                var proc = procs[idx];
                API.carregarItensProcessoCompleto(proc.id).then(function(itens) {
                    function cab() {
                        doc.setFontSize(14); doc.setFont("helvetica","bold");
                        doc.text("Universidade Federal de Uberlândia", pw/2, 15, {align:"center"});
                        doc.setFontSize(10); doc.setFont("helvetica","normal");
                        doc.text(proc.pro_reitoria_unidade||"", pw/2, 21, {align:"center"});
                        doc.line(15, 30, pw-15, 30);
                        doc.text("PROCESSO SEI: " + proc.sei, 15, 38);
                        doc.text("SALA / ESPAÇO: " + (proc.sala||""), 15, 43);
                    }
                    if (itens.length === 0) {
                        if (!primeiro) doc.addPage(); primeiro = false;
                        cab(); doc.setFontSize(10); doc.text("Nenhum item registrado.", 15, 55);
                        proximo(idx+1); return;
                    }
                    for (var p = 0; p < itens.length; p += IPP) {
                        if (!primeiro || p > 0) doc.addPage(); primeiro = false;
                        cab();
                        var chunk = itens.slice(p, p+IPP), fotos = [];
                        var body = chunk.map(function(i) {
                            fotos.push(i.foto||"");
                            return [{content:"",styles:{minCellHeight:40}},
                                "Patrimônio: "+i.patrimonio+"\nDescrição: "+i.descricao+
                                "\nTamanho: "+(i.tamanho||"")+"\nViável: "+(i.viavel?"Sim":"Não")+"\nBVM: "+(i.bvm?"Sim":"Não")];
                        });
                        doc.autoTable({ startY:48, head:[["Foto","Detalhes"]], body:body,
                            columnStyles:{0:{cellWidth:45},1:{cellWidth:"auto"}},
                            styles:{fontSize:10.5,valign:"middle",cellPadding:4},
                            didDrawCell: function(fc){ return function(d) {
                                if (d.column.index===0 && d.cell.section==="body") {
                                    var img=fc[d.row.index];
                                    if(img){try{ var cw=d.cell.width-4,ch=d.cell.height-4,s=Math.min(cw,ch);
                                        doc.addImage(img,"JPEG",d.cell.x+2+(cw-s)/2,d.cell.y+2+(ch-s)/2,s,s);
                                    }catch(e){}}
                                }
                            };}(fotos)
                        });
                    }
                    proximo(idx+1);
                });
            }
            proximo(0);
        },

        // ── exportações da lista geral (todos os filtrados) ──
        exportarCSVTodos:          function() { this._exportarCSV(this.processosFiltrados); },
        exportarExcelTodos:        function() { this._exportarExcel(this.processosFiltrados); },
        exportarPDFConsolidado:    function() { this.exportando = true; this._exportarPDFConsolidado(this.processosFiltrados, "Recolhimento_Consolidado"); },

        // ── exportações dos selecionados ──
        exportarCSVSelecionados:            function() { this._exportarCSV(this.processosSelecionadosLista); },
        exportarExcelSelecionados:          function() { this._exportarExcel(this.processosSelecionadosLista); },
        exportarPDFConsolidadoSelecionados: function() { this._exportarPDFConsolidado(this.processosSelecionadosLista, "Selecionados_Consolidado"); },

        // ── PDF individual por processo ──
        exportarPDFProcesso: function(proc) {
            var self = this;
            API.carregarItensProcessoCompleto(proc.id).then(function(itens) {
                var tmp = { processo: self.processo, itens: self.itens };
                self.processo = proc; self.itens = itens;
                self.criarPDF();
                self.processo = tmp.processo; self.itens = tmp.itens;
            });
        },

        // =============================================
        // ABA DOCUMENTO
        // =============================================
        carregarProcessoPDF: function() {
            var self = this;
            return API.buscarProcessoPorSEI(this.buscaSei).then(function(proc) {
                if (!proc) { alert("Processo não encontrado."); return null; }
                self.processo = proc;
                return API.carregarItensProcesso(proc.id).then(function(itens) { self.itens = itens; return proc; });
            });
        },

        gerarDocumento: function() {
            var self = this;
            this.carregarProcessoPDF().then(function(proc) {
                if (!proc) return;
                self.exportando = true;
                self.criarPDF();
                if (self.itens.length > 0) {
                    API.enviarParaSharePoint(self.processo, self.itens)
                       .then(function() { self.exportando = false; })
                       .catch(function() { self.exportando = false; });
                } else { self.exportando = false; }
            });
        },

        criarPDF: function() {
            var jsPDF = window.jspdf.jsPDF;
            var doc = new jsPDF("p", "mm", "a4");
            var pw = doc.internal.pageSize.getWidth();
            var itensParaPDF = this.itens.slice();
            var processo = this.processo;
            var IPP = 5;
            function cab() {
                doc.setFontSize(14); doc.setFont("helvetica","bold");
                doc.text("Universidade Federal de Uberlândia", pw/2, 15, {align:"center"});
                doc.setFontSize(10); doc.setFont("helvetica","normal");
                doc.text(processo.pro_reitoria_unidade||"", pw/2, 21, {align:"center"});
                doc.line(15, 30, pw-15, 30);
                doc.text("PROCESSO SEI: " + processo.sei, 15, 38);
                doc.text("SALA / ESPAÇO: " + processo.sala, 15, 43);
            }
            for (var p = 0; p < itensParaPDF.length; p += IPP) {
                if (p > 0) doc.addPage(); cab();
                var chunk = itensParaPDF.slice(p, p+IPP), fotos = [];
                var body = chunk.map(function(i) {
                    fotos.push(i.foto||"");
                    return [{content:"",styles:{minCellHeight:40}},
                        "Patrimônio: "+i.patrimonio+"\nDescrição: "+i.descricao+
                        "\nTamanho: "+(i.tamanho||"")+"\nViável: "+(i.viavel?"Sim":"Não")+"\nBVM: "+(i.bvm?"Sim":"Não")];
                });
                doc.autoTable({ startY:48, head:[["Foto","Detalhes"]], body:body,
                    columnStyles:{0:{cellWidth:45},1:{cellWidth:"auto"}},
                    styles:{fontSize:10.5,valign:"middle",cellPadding:4},
                    didDrawCell: function(fc){ return function(d) {
                        if (d.column.index===0 && d.cell.section==="body") {
                            var img=fc[d.row.index];
                            if(img){try{ var cw=d.cell.width-4,ch=d.cell.height-4,s=Math.min(cw,ch);
                                doc.addImage(img,"JPEG",d.cell.x+2+(cw-s)/2,d.cell.y+2+(ch-s)/2,s,s);
                            }catch(e){}}
                        }
                    };}(fotos)
                });
            }
            doc.save("Recolhimento_" + processo.sei + ".pdf");
        },

        // =============================================
        // ABA CLASSIFICAÇÃO PRÉVIA
        // =============================================
        get classifPendentesCount() {
            return this.classifItens.filter(function(i) { return !i.avaliacao; }).length;
        },

        get classifAvaliadosCount() {
            return this.classifItens.filter(function(i) { return !!i.avaliacao; }).length;
        },

        get classifItensFiltrados() {
            if (this.classifFiltro === "pendentes") {
                return this.classifItens.filter(function(i) { return !i.avaliacao; });
            }
            if (this.classifFiltro === "avaliados") {
                return this.classifItens.filter(function(i) { return !!i.avaliacao; });
            }
            return this.classifItens;
        },

        carregarProcessoClassificacao: function() {
            var self = this;
            this.classifErro = null;
            this.classifProcesso = null;
            this.classifItens = [];
            if (!this.buscaSeiClassif || this.buscaSeiClassif.length < 20) {
                this.classifErro = "Informe o número SEI completo.";
                return;
            }
            this.classifCarregando = true;
            API.buscarProcessoPorSEI(this.buscaSeiClassif).then(function(proc) {
                if (!proc) {
                    self.classifErro = "Processo não encontrado.";
                    self.classifCarregando = false;
                    return;
                }
                self.classifProcesso = proc;
                return API.carregarItensProcessoCompleto(proc.id).then(function(itens) {
                    self.classifItens = itens;
                    self.classifCarregando = false;
                    self.classifFiltro = self.classifPendentesCount > 0 ? "pendentes" : "todos";
                });
            }).catch(function(err) {
                self.classifErro = "Erro ao carregar processo: " + (err && err.message ? err.message : "desconhecido");
                self.classifCarregando = false;
            });
        },

        definirAvaliacaoClassif: function(item, valor) {
            if (!item || !valor) return;
            if (item._salvandoAval) return;
            var self = this;
            item._salvandoAval = true;
            this.classifItens = this.classifItens.slice();
            var campos = { avaliacao: valor, avaliado_em: new Date().toISOString() };
            API.editarItem(item.id, campos).then(function(atualizado) {
                var idx = self.classifItens.findIndex(function(x) { return x.id === item.id; });
                if (idx !== -1) {
                    var preservado = Object.assign({}, atualizado, { _salvandoAval: false });
                    self.classifItens.splice(idx, 1, preservado);
                }
            }).catch(function() {
                item._salvandoAval = false;
                self.classifItens = self.classifItens.slice();
                alert("Falha ao salvar avaliação. Tente novamente.");
            });
        },

        gerarRelatorioClassificacao: function() {
            if (this.classifPendentesCount > 0) {
                alert("Avalie todos os itens antes de gerar o relatório (faltam " + this.classifPendentesCount + ").");
                return;
            }
            if (this.classifItens.length === 0) {
                alert("Nenhum item para gerar relatório.");
                return;
            }
            this.classifGerando = true;
            try {
                this.criarPDFClassificacaoPrevia();
            } finally {
                this.classifGerando = false;
            }
        },

        criarPDFClassificacaoPrevia: function() {
            var self = this;
            var jsPDF = window.jspdf.jsPDF;
            var doc = new jsPDF("p", "mm", "a4");
            var pw = doc.internal.pageSize.getWidth();
            var itensParaPDF = this.classifItens.slice();
            var processo = this.classifProcesso;
            var IPP = 5;

            function cab() {
                doc.setFontSize(14); doc.setFont("helvetica", "bold");
                doc.text("Universidade Federal de Uberlândia", pw / 2, 15, { align: "center" });
                doc.setFontSize(11); doc.setFont("helvetica", "bold");
                doc.text("Classificação Prévia de Bens Coletados", pw / 2, 22, { align: "center" });
                doc.setFontSize(10); doc.setFont("helvetica", "normal");
                doc.text(processo.pro_reitoria_unidade || "", pw / 2, 28, { align: "center" });
                doc.line(15, 33, pw - 15, 33);
                doc.text("PROCESSO SEI: " + processo.sei, 15, 40);
                doc.text("SALA / ESPAÇO: " + (processo.sala || ""), 15, 45);
            }

            for (var p = 0; p < itensParaPDF.length; p += IPP) {
                if (p > 0) doc.addPage();
                cab();
                var chunk = itensParaPDF.slice(p, p + IPP);
                var fotos = [];
                var body = chunk.map(function(i) {
                    fotos.push(i.foto || "");
                    return [
                        { content: "", styles: { minCellHeight: 40 } },
                        "Empresa: " + self.resolverEmpresa(i) +
                        "\nPatrimônio: " + i.patrimonio +
                        "\nDescrição: " + i.descricao +
                        "\nTamanho: " + (i.tamanho || "") +
                        "\nAvaliação: " + formatarAvaliacao(i.avaliacao)
                    ];
                });
                doc.autoTable({
                    startY: 50, head: [["Foto", "Detalhes"]], body: body,
                    columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: "auto" } },
                    styles: { fontSize: 10.5, valign: "middle", cellPadding: 4 },
                    didDrawCell: (function(fc) {
                        return function(d) {
                            if (d.column.index === 0 && d.cell.section === "body") {
                                var img = fc[d.row.index];
                                if (img) {
                                    try {
                                        var cw = d.cell.width - 4, ch = d.cell.height - 4, s = Math.min(cw, ch);
                                        doc.addImage(img, "JPEG", d.cell.x + 2 + (cw - s) / 2, d.cell.y + 2 + (ch - s) / 2, s, s);
                                    } catch (e) { /* ignora foto inválida */ }
                                }
                            }
                        };
                    })(fotos)
                });
            }
            doc.save("Classificacao_Previa_" + processo.sei + ".pdf");
        },

        // =============================================
        // BUSCA GLOBAL
        // =============================================
        executarBuscaGlobal: function() {
            var self = this;
            var termo = (this.buscaGlobal || "").trim();
            if (!termo || termo.length < 2) return;
            this.buscaGlobalCarregando = true; this.buscaGlobalFeita = false; this.buscaGlobalResultados = [];

            var q1 = API.db.from("patrimonios")
                .select("id, patrimonio, descricao, foto, situacao, tamanho, viavel, bvm, processo_id")
                .or("patrimonio.ilike.%" + termo + "%,descricao.ilike.%" + termo + "%")
                .limit(100);

            var q2 = API.db.from("processos")
                .select("id, sei, sala, pro_reitoria_unidade")
                .or("sei.ilike.%" + termo + "%,sala.ilike.%" + termo + "%,pro_reitoria_unidade.ilike.%" + termo + "%")
                .limit(100);

            Promise.all([q1, q2]).then(function(results) {
                var itensDiretos    = results[0].data || [];
                var processosDiretos = results[1].data || [];
                var procIdsViaItens  = itensDiretos.map(function(i) { return i.processo_id; });
                var procIdsDiretos   = processosDiretos.map(function(p) { return p.id; });
                var todosIds = Array.from(new Set(procIdsViaItens.concat(procIdsDiretos)));
                if (todosIds.length === 0) { self.buscaGlobalCarregando = false; self.buscaGlobalFeita = true; return; }

                API.db.from("processos").select("*").in("id", todosIds).then(function(r) {
                    var processos = r.data || [];
                    self.buscaGlobalResultados = processos.map(function(proc) {
                        return { processo: proc, itens: itensDiretos.filter(function(i) { return i.processo_id === proc.id; }) };
                    });
                    self.buscaGlobalCarregando = false; self.buscaGlobalFeita = true;
                });
            }).catch(function() { self.buscaGlobalCarregando = false; self.buscaGlobalFeita = true; });
        },

        // =============================================
        // BACKUP
        // =============================================
        carregarEstatisticasBackup: function() {
            var self = this;
            this.backupCarregandoStats = true;
            this.backupResultado = null;
            API.obterEstatisticasBackup()
                .then(function(stats) { self.backupStats = stats; self.backupCarregandoStats = false; })
                .catch(function() { self.backupStats = null; self.backupCarregandoStats = false; });
        },

        _baixarArquivo: function(blob, nome) {
            var url = URL.createObjectURL(blob);
            var a = document.createElement("a");
            a.href = url; a.download = nome;
            document.body.appendChild(a); a.click();
            document.body.removeChild(a);
            setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
        },

        _timestampArquivo: function() {
            var d = new Date();
            var pad = function(n) { return String(n).padStart(2, "0"); };
            return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "_" + pad(d.getHours()) + pad(d.getMinutes());
        },

        exportarBackupJSON: function() {
            var self = this;
            if (this.backupExportando) return;
            this.backupExportando = true;
            this.backupResultado = null;
            API.exportarBackupCompleto({ incluirFotos: this.backupIncluirFotos }).then(function(backup) {
                var json = JSON.stringify(backup);
                var blob = new Blob([json], { type: "application/json;charset=utf-8" });
                var nome = "backup_recolhimento_" + self._timestampArquivo() + (self.backupIncluirFotos ? "_completo" : "_metadados") + ".json";
                self._baixarArquivo(blob, nome);
                var mb = (blob.size / (1024 * 1024)).toFixed(2);
                self.backupResultado = { tipo: "export", ok: true, mensagem: "✓ Backup gerado: " + nome + " (" + mb + " MB)" };
                self.backupExportando = false;
            }).catch(function(err) {
                self.backupResultado = { tipo: "export", ok: false, mensagem: "❌ Falha ao exportar: " + (err && err.message ? err.message : "erro desconhecido") };
                self.backupExportando = false;
            });
        },

        _carregarJSZip: function() {
            if (window.JSZip) return Promise.resolve(window.JSZip);
            return new Promise(function(resolve, reject) {
                var s = document.createElement("script");
                s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
                s.onload = function() { resolve(window.JSZip); };
                s.onerror = function() { reject(new Error("Falha ao carregar JSZip.")); };
                document.head.appendChild(s);
            });
        },

        _sanitizarNomeArquivo: function(s) {
            return String(s || "").replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");
        },

        _base64ParaBlob: function(dataUrl) {
            try {
                var virgula = dataUrl.indexOf(",");
                var meta = dataUrl.substring(5, virgula);
                var mime = (meta.split(";")[0]) || "image/jpeg";
                var bin = atob(dataUrl.substring(virgula + 1));
                var len = bin.length;
                var bytes = new Uint8Array(len);
                for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
                return new Blob([bytes], { type: mime });
            } catch (e) { return null; }
        },

        exportarBackupZIP: function() {
            var self = this;
            if (this.backupExportandoZIP) return;
            this.backupExportandoZIP = true;
            this.backupResultado = null;
            this._carregarJSZip().then(function(JSZip) {
                return API.exportarBackupCompleto({ incluirFotos: true }).then(function(backup) {
                    var zip = new JSZip();
                    var backupSemFotos = JSON.parse(JSON.stringify(backup));
                    var processosPorId = {};
                    (backup.data.processos || []).forEach(function(p) { processosPorId[p.id] = p; });
                    var fotosDir = zip.folder("fotos");
                    var contFotos = 0;
                    (backup.data.patrimonios || []).forEach(function(it, idx) {
                        if (it.foto && typeof it.foto === "string" && it.foto.indexOf("data:image") === 0) {
                            var blob = self._base64ParaBlob(it.foto);
                            if (blob) {
                                var proc = processosPorId[it.processo_id];
                                var seiSan = self._sanitizarNomeArquivo(proc ? proc.sei : "sem_processo");
                                var nome = seiSan + "/" + self._sanitizarNomeArquivo(it.patrimonio || ("item_" + idx)) + "_" + (it.id || idx) + ".jpg";
                                fotosDir.file(nome, blob);
                                contFotos++;
                            }
                        }
                        if (backupSemFotos.data && backupSemFotos.data.patrimonios && backupSemFotos.data.patrimonios[idx]) {
                            backupSemFotos.data.patrimonios[idx].foto = "";
                        }
                    });
                    backupSemFotos.include_photos = false;
                    zip.file("backup.json", JSON.stringify(backupSemFotos));
                    zip.file("LEIA-ME.txt",
                        "Backup do Sistema de Recolhimento UFU\n" +
                        "Gerado em: " + backup.generated_at + "\n" +
                        "Versao do backup: " + backup.version + "\n\n" +
                        "Conteudo:\n" +
                        "- backup.json: dados completos do banco (sem fotos embutidas)\n" +
                        "- fotos/<SEI>/<patrimonio>_<id>.jpg: fotos extraidas (" + contFotos + " arquivos)\n\n" +
                        "Para restaurar:\n" +
                        "1. Use o arquivo backup.json na aba Backup -> Restaurar.\n" +
                        "2. As fotos do ZIP servem como copia adicional segura.\n");
                    return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } })
                        .then(function(blob) {
                            var nome = "backup_recolhimento_" + self._timestampArquivo() + ".zip";
                            self._baixarArquivo(blob, nome);
                            var mb = (blob.size / (1024 * 1024)).toFixed(2);
                            self.backupResultado = { tipo: "export", ok: true, mensagem: "✓ ZIP gerado: " + nome + " (" + mb + " MB, " + contFotos + " fotos)" };
                            self.backupExportandoZIP = false;
                        });
                });
            }).catch(function(err) {
                self.backupResultado = { tipo: "export", ok: false, mensagem: "❌ Falha ao gerar ZIP: " + (err && err.message ? err.message : "erro desconhecido") };
                self.backupExportandoZIP = false;
            });
        },

        selecionarArquivoRestauracao: function(e) {
            var self = this;
            this.backupArquivo = null;
            this.backupArquivoConteudo = null;
            this.backupArquivoErro = null;
            this.backupConfirmacao = "";
            var file = e.target.files && e.target.files[0];
            if (!file) return;
            if (file.size > 500 * 1024 * 1024) {
                this.backupArquivoErro = "Arquivo muito grande (>500MB).";
                return;
            }
            var reader = new FileReader();
            reader.onload = function(ev) {
                try {
                    var conteudo = JSON.parse(ev.target.result);
                    if (!conteudo || !conteudo.version || !conteudo.data) {
                        self.backupArquivoErro = "Arquivo não parece ser um backup válido (sem campo version/data).";
                        return;
                    }
                    self.backupArquivo = { nome: file.name, tamanho: file.size };
                    self.backupArquivoConteudo = conteudo;
                } catch (err) {
                    self.backupArquivoErro = "JSON inválido: " + err.message;
                }
            };
            reader.onerror = function() { self.backupArquivoErro = "Erro ao ler o arquivo."; };
            reader.readAsText(file);
        },

        executarRestauracaoBackup: function() {
            var self = this;
            if (!this.backupArquivoConteudo) return;
            if (this.backupConfirmacao !== "RESTAURAR") {
                alert("Digite RESTAURAR (em maiúsculas) no campo de confirmação para prosseguir.");
                return;
            }
            if (!confirm("Esta operação vai sobrescrever registros existentes (mesmo ID). Continuar?")) return;
            this.backupRestaurando = true;
            this.backupResultado = null;
            API.restaurarBackupCompleto(this.backupArquivoConteudo).then(function(r) {
                self.backupRestaurando = false;
                self.backupResultado = {
                    tipo: "restore", ok: true,
                    mensagem: "✓ Restauração concluída — " +
                        r.restaurado.campus + " campus, " +
                        r.restaurado.unidades + " unidades, " +
                        r.restaurado.blocos + " blocos, " +
                        r.restaurado.processos + " processos, " +
                        r.restaurado.patrimonios + " patrimônios."
                };
                self.backupArquivo = null;
                self.backupArquivoConteudo = null;
                self.backupConfirmacao = "";
                self.carregarEstatisticasBackup();
            }).catch(function(err) {
                self.backupRestaurando = false;
                self.backupResultado = {
                    tipo: "restore", ok: false,
                    mensagem: "❌ Falha na restauração: " + (err && err.message ? err.message : "erro desconhecido")
                };
            });
        },

        cancelarRestauracao: function() {
            this.backupArquivo = null;
            this.backupArquivoConteudo = null;
            this.backupArquivoErro = null;
            this.backupConfirmacao = "";
        },

        dispararBackupAutomaticoAgora: function() {
            var self = this;
            var url = (window.APP_CONFIG || {}).BACKUP_TRIGGER_URL || "";
            if (!url) {
                this.backupAutoMensagem = { ok: false, texto: "URL do backup automático (BACKUP_TRIGGER_URL) não configurada em config.js." };
                return;
            }
            if (!confirm("Disparar backup automático agora? Pode levar alguns minutos.")) return;
            this.backupAutoEnviando = true;
            this.backupAutoMensagem = null;
            fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trigger: "manual" }) })
                .then(function(r) {
                    if (!r.ok) return r.text().then(function(t) { throw new Error(t || ("HTTP " + r.status)); });
                    return r.json().catch(function() { return {}; });
                })
                .then(function(result) {
                    self.backupAutoEnviando = false;
                    self.backupAutoMensagem = {
                        ok: true,
                        texto: "✓ Backup automático disparado." + (result && result.processos ? " (" + result.processos + " processos enviados)" : "")
                    };
                })
                .catch(function(err) {
                    self.backupAutoEnviando = false;
                    self.backupAutoMensagem = { ok: false, texto: "❌ Falha: " + (err && err.message ? err.message : "erro desconhecido") };
                });
        }
    };
}
