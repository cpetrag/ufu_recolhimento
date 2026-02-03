function app() {
    return {
        aba: "processo",
        campus: [],
        blocos: [],
        itens: [],
        baseCSV: [],
        unidades_db: [],
        processoId: null,
        loading: false,
        exportando: false,
        buscaSei: "",
        patrimonioNaoEncontrado: false,
        resultadoEnvio: null,
        processo: { sei: "", pro_reitoria_unidade: "", campus_id: "", bloco_id: "", sala: "" },
        item: { patrimonio: "", descricao: "", tamanho: "", viavel: false, bvm: false, foto: "" },

        init: function() {
            var self = this;
            API.carregarCampus().then(function(data) { self.campus = data; });
            API.carregarUnidades().then(function(data) { self.unidades_db = data; });
            Papa.parse("https://ahzeyywnngbbxrqtjlue.supabase.co/storage/v1/object/public/arquivos/base.csv", {
                download: true,
                header: true,
                skipEmptyLines: true,
                complete: function(r) { self.baseCSV = r.data; }
            });
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
    var vZ = v.padStart(6, "0");
    var achado = this.baseCSV.find(function(i) {
        return String(i.NroPatrimonio).padStart(6, "0") === vZ || (String(i.CodioBarra) !== "0" && String(i.CodioBarra) === String(parseInt(v, 10)));
    });
    this.item.descricao = achado ? achado.DescricaoBem : "";
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

        salvarItem: function() {
            var self = this;
            if (!this.item.patrimonio) { alert("Informe o Nº Patrimônio."); return; }
            if (!this.item.descricao && !this.item.bvm) { alert("Patrimônio não encontrado. Marque BVM para descrição manual."); return; }
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
                self.item = { patrimonio: "", descricao: "", tamanho: "", viavel: false, bvm: false, foto: "" };
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

        gerarPDF: function() {
            var self = this;
            this.carregarProcessoPDF().then(function(proc) {
                if (proc) self.criarPDF();
            });
        },

        enviarSharePoint: function() {
            var self = this;
            this.carregarProcessoPDF().then(function(proc) {
                if (!proc) return;
                if (self.itens.length === 0) {
                    alert("Nenhum item para enviar.");
                    return;
                }
                self.exportando = true;
                self.resultadoEnvio = null;
                API.enviarParaSharePoint(self.processo, self.itens).then(function(resultados) {
                    var sucesso = resultados.filter(function(r) { return r.ok; }).length;
                    var falha = resultados.filter(function(r) { return !r.ok; }).length;
                    self.resultadoEnvio = {
                        erro: falha > 0,
                        mensagem: "Enviados: " + sucesso + "/" + self.itens.length + (falha > 0 ? " | Falhas: " + falha : " ✓")
                    };
                    self.exportando = false;
                }).catch(function(e) {
                    self.resultadoEnvio = { erro: true, mensagem: "Erro: " + e.message };
                    self.exportando = false;
                });
            });
        },

        gerarPDFeEnviar: function() {
            var self = this;
            this.carregarProcessoPDF().then(function(proc) {
                if (!proc) return;
                self.exportando = true;
                self.resultadoEnvio = null;
                self.criarPDF();
                if (self.itens.length > 0) {
                    API.enviarParaSharePoint(self.processo, self.itens).then(function(resultados) {
                        var sucesso = resultados.filter(function(r) { return r.ok; }).length;
                        self.resultadoEnvio = {
                            erro: false,
                            mensagem: "PDF gerado ✓ | SharePoint: " + sucesso + "/" + self.itens.length + " enviados ✓"
                        };
                        self.exportando = false;
                    }).catch(function(e) {
                        self.resultadoEnvio = { erro: true, mensagem: "Erro: " + e.message };
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
            var self = this;

            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.text("Universidade Federal de Uberlândia", pageWidth / 2, 15, { align: "center" });
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.text(this.processo.pro_reitoria_unidade || "", pageWidth / 2, 21, { align: "center" });
            doc.line(15, 30, pageWidth - 15, 30);
            doc.text("PROCESSO SEI: " + this.processo.sei, 15, 38);
            doc.text("SALA / ESPAÇO: " + this.processo.sala, 15, 43);

            var tableBody = this.itens.map(function(i) {
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
                didDrawCell: function(data) {
                    if (data.column.index === 0 && data.cell.section === "body") {
                        var img = self.itens[data.row.index].foto;
                        if (img) {
                            doc.addImage(img, "JPEG", data.cell.x + 2, data.cell.y + 2, data.cell.width - 4, data.cell.height - 4);
                        }
                    }
                }
            });
            doc.save("Recolhimento_" + this.processo.sei + ".pdf");
        }
    };

}




