// URL da base de patrimônio (CSV) - hospedado no Netlify
var BASE_CSV_URL = "https://custodioufu.netlify.app/base.csv";

function app() {
    return {
        aba: "processo",
        campus: [],
        blocos: [],
        itens: [],
        baseCSV: [],
        csvCarregando: true,
        csvCarregado: false,
        csvErro: null,
        unidades_db: [],
        processoId: null,
        loading: false,
        exportando: false,
        buscaSei: "",
        patrimonioNaoEncontrado: false,
        processo: { sei: "", pro_reitoria_unidade: "", campus_id: "", bloco_id: "", sala: "" },
        item: { patrimonio: "", descricao: "", tamanho: "", viavel: false, bvm: false, foto: "", semPatrimonio: false },

        init: function() {
            var self = this;
            API.carregarCampus().then(function(data) { self.campus = data; });
            API.carregarUnidades().then(function(data) { self.unidades_db = data; });
            this.carregarBaseCSV();
        },

        carregarBaseCSV: function() {
            var self = this;
            this.csvCarregando = true;
            this.csvCarregado = false;
            this.csvErro = null;
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
                            CodioBarra: self._valor(linha, map.CodioBarra),
                            DescricaoBem: self._valor(linha, map.DescricaoBem)
                        };
                    }).filter(function(l) { return l.NroPatrimonio !== undefined || l.CodioBarra !== undefined; });
                    self.csvCarregando = false;
                    self.csvCarregado = true;
                })
                .catch(function(err) {
                    self.csvCarregando = false;
                    self.csvErro = err && err.message ? err.message : "Erro ao carregar base";
                });
        },

        _mapearColunas: function(campos) {
            var nro = ["NroPatrimonio", "Nro Patrimônio", "Patrimônio", "Numero", "Número", "Nro"];
            var cod = ["CodioBarra", "CodigoBarra", "Código de Barras", "Codigo Barras"];
            var desc = ["DescricaoBem", "Descrição do Bem", "Descricao", "Descrição"];
            function achar(lista) {
                for (var i = 0; i < campos.length; i++) {
                    var c = (campos[i] || "").replace(/\uFEFF/g, "").trim();
                    for (var j = 0; j < lista.length; j++) if (c === lista[j]) return campos[i];
                }
                for (var k = 0; k < campos.length; k++) {
                    var key = (campos[k] || "").replace(/\uFEFF/g, "").trim();
                    if (/patrim|numero|nro/i.test(key)) return campos[k];
                    if (/codigo|barra/i.test(key)) return campos[k];
                    if (/descri/i.test(key)) return campos[k];
                }
                return campos[0] || null;
            }
            return { NroPatrimonio: achar(nro) || campos[0], CodioBarra: achar(cod) || campos[1], DescricaoBem: achar(desc) || campos[2] };
        },

        _valor: function(linha, chave) {
            if (!chave) return undefined;
            var v = linha[chave];
            return v !== undefined && v !== null ? String(v).trim() : undefined;
        },

        carregarBlocos: function() {
            var self = this;
            API.carregarBlocos(this.processo.campus_id).then(function(data) {
                self.blocos = data;
            });
        },

        buscarProcessoExistente: function() {
            var self = this;
            API.buscarProcessoPorSEI(this.processo.sei).then(function(data) {
                if (data) {
                    self.processo = data;
                    self.processoId = data.id;
                    self.carregarBlocos();
                    API.carregarItensProcesso(data.id).then(function(itens) {
                        self.itens = itens;
                    });
                    alert("Processo carregado!");
                    self.aba = "itens";
                }
            });
        },

        salvarProcesso: function() {
            var self = this;
            if (!this.processo.sei || this.processo.sei.length < 20) {
                alert("Preencha o Número SEI corretamente.");
                return;
            }
            if (!this.processo.pro_reitoria_unidade) {
                alert("Preencha a Pró-Reitoria / Unidade.");
                return;
            }
            if (!this.processo.campus_id) {
                alert("Selecione o Campus.");
                return;
            }
            if (!this.processo.sala) {
                alert("Preencha a Sala/Espaço.");
                return;
            }
            API.salvarProcesso(this.processo).then(function(data) {
                self.processoId = data.id;
                self.processo = data;
                self.aba = "itens";
            });
        },

        buscarPatrimonio: function() {
            var v = String(this.item.patrimonio).trim();
            if (!v) {
                this.item.descricao = "";
                this.patrimonioNaoEncontrado = false;
                return;
            }
            if (!this.csvCarregado || this.baseCSV.length === 0) {
                this.patrimonioNaoEncontrado = false;
                return;
            }
            var vNum = parseInt(v, 10);
            var achado = this.baseCSV.find(function(i) {
                var nroPat = parseInt(String(i.NroPatrimonio || "").trim(), 10);
                var codBar = parseInt(String(i.CodioBarra || "").trim(), 10);
                if (!isNaN(nroPat) && nroPat === vNum) return true;
                if (!isNaN(codBar) && codBar !== 0 && codBar === vNum) return true;
                if (String(i.NroPatrimonio || "").trim() === v || String(i.CodioBarra || "").trim() === v) return true;
                return false;
            });
            this.item.descricao = achado ? (achado.DescricaoBem || "") : "";
            this.patrimonioNaoEncontrado = !achado;
        },

        capturarFoto: function(e) {
            var self = this;
            var file = e.target.files[0];
            if (file) {
                API.processarFoto(file).then(function(foto) {
                    self.item.foto = foto;
                });
            }
        },

        colarFoto: function(e) {
            var self = this;
            var items = e.clipboardData && e.clipboardData.items;
            if (!items) {
                alert("Navegador não suporta colar imagens.");
                return;
            }
            for (var i = 0; i < items.length; i++) {
                if (items[i].type.indexOf("image") !== -1) {
                    var blob = items[i].getAsFile();
                    if (blob) {
                        API.processarFoto(blob).then(function(foto) {
                            self.item.foto = foto;
                        });
                        return;
                    }
                }
            }
            alert("Nenhuma imagem encontrada. Copie uma imagem primeiro e depois cole aqui (Ctrl+V).");
        },

        colarFotoBtn: function() {
            var self = this;
            if (!navigator.clipboard || !navigator.clipboard.read) {
                alert("Clique nesta área e use Ctrl+V para colar a imagem.");
                return;
            }
            navigator.clipboard.read().then(function(items) {
                for (var i = 0; i < items.length; i++) {
                    var types = items[i].types;
                    for (var j = 0; j < types.length; j++) {
                        if (types[j].indexOf("image") !== -1) {
                            items[i].getType(types[j]).then(function(blob) {
                                API.processarFoto(blob).then(function(foto) {
                                    self.item.foto = foto;
                                });
                            });
                            return;
                        }
                    }
                }
                alert("Nenhuma imagem na área de transferência. Copie uma imagem e tente novamente.");
            }).catch(function() {
                alert("Sem permissão para acessar clipboard. Clique nesta área e use Ctrl+V.");
            });
        },

        salvarItem: function() {
            var self = this;
            if (!this.item.patrimonio) { alert("Informe o Nº Patrimônio."); return; }

            // Verifica se patrimônio já existe no processo (ignora "Sem número")
            if (this.item.patrimonio !== "Sem número") {
                var patrimonioExiste = this.itens.some(function(i) {
                    return String(i.patrimonio) === String(self.item.patrimonio);
                });
                if (patrimonioExiste) {
                    alert("Este patrimônio já foi cadastrado neste processo.");
                    return;
                }
            }

            if (this.item.semPatrimonio && !this.item.descricao.trim()) { alert("Informe a descrição do item."); return; }
            if (!this.item.semPatrimonio && !this.item.descricao && !this.item.bvm) { alert("Patrimônio não encontrado. Marque BVM para descrição manual."); return; }
            if (this.item.bvm && !this.item.descricao.trim()) { alert("Informe a descrição (BVM)."); return; }
            if (!this.item.tamanho) { alert("Selecione o Tamanho."); return; }
            if (!this.item.foto) { alert("Capture a Foto."); return; }

            this.loading = true;
            API.salvarItem(this.item, this.processoId).then(function() {
                self.itens.unshift({
                    patrimonio: self.item.patrimonio,
                    descricao: self.item.descricao,
                    tamanho: self.item.tamanho,
                    viavel: self.item.viavel,
                    bvm: self.item.bvm,
                    foto: self.item.foto
                });
                self.item = { patrimonio: "", descricao: "", tamanho: "", viavel: false, bvm: false, foto: "", semPatrimonio: false };
                self.patrimonioNaoEncontrado = false;
                self.loading = false;
            }).catch(function() {
                self.loading = false;
            });
        },

        carregarProcessoPDF: function() {
            var self = this;
            return API.buscarProcessoPorSEI(this.buscaSei).then(function(proc) {
                if (!proc) {
                    alert("Processo não encontrado.");
                    return null;
                }
                self.processo = proc;
                return API.carregarItensProcesso(proc.id).then(function(itens) {
                    self.itens = itens;
                    return proc;
                });
            });
        },

        gerarDocumento: function() {
            var self = this;
            this.carregarProcessoPDF().then(function(proc) {
                if (!proc) return;
                self.exportando = true;
                self.criarPDF();
                if (self.itens.length > 0) {
                    API.enviarParaSharePoint(self.processo, self.itens).then(function() {
                        self.exportando = false;
                    }).catch(function() {
                        self.exportando = false;
                    });
                } else {
                    self.exportando = false;
                }
            });
        },

        criarPDF: function() {
            var jsPDF = window.jspdf.jsPDF;
            var doc = new jsPDF("p", "mm", "a4");
            var pageWidth = doc.internal.pageSize.getWidth();
            var itensParaPDF = this.itens.slice();
            var processo = this.processo;
            var ITENS_POR_PAGINA = 5;

            function desenharCabecalho() {
                doc.setFontSize(14);
                doc.setFont("helvetica", "bold");
                doc.text("Universidade Federal de Uberlândia", pageWidth / 2, 15, { align: "center" });
                doc.setFontSize(10);
                doc.setFont("helvetica", "normal");
                doc.text(processo.pro_reitoria_unidade || "", pageWidth / 2, 21, { align: "center" });
                doc.line(15, 30, pageWidth - 15, 30);
                doc.text("PROCESSO SEI: " + processo.sei, 15, 38);
                doc.text("SALA / ESPAÇO: " + processo.sala, 15, 43);
            }

            for (var p = 0; p < itensParaPDF.length; p += ITENS_POR_PAGINA) {
                if (p > 0) doc.addPage();
                desenharCabecalho();

                var chunk = itensParaPDF.slice(p, p + ITENS_POR_PAGINA);
                var fotos = [];
                var tableBody = chunk.map(function(i) {
                    fotos.push(i.foto || "");
                    return [
                        { content: "", styles: { minCellHeight: 40 } },
                        "Patrimônio: " + i.patrimonio + "\nDescrição: " + i.descricao + "\nTamanho: " + i.tamanho + "\nViável: " + (i.viavel ? "Sim" : "Não") + "\nBVM: " + (i.bvm ? "Sim" : "Não")
                    ];
                });

                doc.autoTable({
                    startY: 48,
                    head: [["Foto", "Detalhes"]],
                    body: tableBody,
                    columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: "auto" } },
                    styles: { fontSize: 10.5, valign: "middle", cellPadding: 4 },
                    didDrawCell: function(fotos) {
                        return function(data) {
                            if (data.column.index === 0 && data.cell.section === "body") {
                                var img = fotos[data.row.index];
                                if (img) {
                                    try {
                                        var cellW = data.cell.width - 4;
                                        var cellH = data.cell.height - 4;
                                        var size = Math.min(cellW, cellH);
                                        var x = data.cell.x + 2 + (cellW - size) / 2;
                                        var y = data.cell.y + 2 + (cellH - size) / 2;
                                        doc.addImage(img, "JPEG", x, y, size, size);
                                    } catch(e) {}
                                }
                            }
                        };
                    }(fotos)
                });
            }

            doc.save("Recolhimento_" + processo.sei + ".pdf");
        }
    };
}
