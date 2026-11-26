"""Guias Foresters PT-BR: fidelidade numérica, links do index e registro de release.

Só usa texto dos PDFs oficiais da Foresters (fixtures em tests/fixtures/foresters-source,
extraídas dos originais EN versionados) e os artefatos em public/academy. Sem dados pessoais.
"""
import hashlib
import html
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ACAD = ROOT / 'public/academy'
FIX = ROOT / 'tests/fixtures/foresters-source'
REL = ROOT / 'docs/academy-release'

PRODUCTS = {
    'smart-ul': dict(code='503346', form='503346 US 04/20', fix='foresters-503346-smart-ul.txt', name='SMART UL'),
    'level-term': dict(code='504387', form='504387 US 05/21', fix='foresters-504387-level-term.txt', name='Level Term'),
    'live-well-plus': dict(code='506014', form='506014 US 04/25', fix='foresters-506014-live-well-plus.txt', name='Live Well Plus'),
    'advantage-plus-ii': dict(code='504933', form='504933 US 03/20', fix='foresters-504933-advantage-plus-ii.txt', name='Advantage Plus II'),
}


def pt_html(slug):
    return (ACAD / f'docs/foresters-{slug}.html').read_text(encoding='utf-8')


def visible_text(raw):
    raw = re.sub(r'<(script|style)\b.*?</\1>', ' ', raw, flags=re.S)
    txt = html.unescape(re.sub(r'<[^>]+>', ' ', raw))
    return norm(txt)


def norm(s):
    s = s.replace('\u2013', '-').replace('\u2014', '-').replace('\u2212', '-').replace('\xa0', ' ')
    return re.sub(r'\s+', ' ', s)


def source_numbers(slug):
    """Tokens numéricos relevantes do texto-fonte EN (valores, %, faixas, prazos)."""
    txt = (FIX / PRODUCTS[slug]['fix']).read_text(encoding='utf-8')
    txt = re.sub(r'=====P\d+=====', ' ', txt)
    txt = norm(txt.replace('\n', ' '))
    toks = set()
    toks |= set(re.findall(r'\$\s?\d[\d,]*(?:\.\d+)?', txt))
    toks |= set(re.findall(r'\d+(?:\.\d+)?%', txt))
    toks |= set(re.findall(r'\b\d{1,3}(?:-| - )\d{1,3}\b', txt))           # faixas 18-60
    toks |= set(re.findall(r'\b\d+(?:-| )(?:year|years|day|days|month|months)\b', txt, flags=re.I))
    toks |= set(re.findall(r'\b0\.\d{2,4}\b', txt))                         # fatores modais
    return {t.replace('$ ', '$') for t in toks}


# Exceções explícitas e justificadas (nº de página, código de form, datas de impressão,
# endereço/telefone tratados em teste próprio, e formatos que o PT converte).
EXCEPT = {
    'common': {
        # Faixas que são página/seção ou data de form no rodapé do original, não regra de produto.
    },
}


def tokens_missing(slug):
    text = visible_text(pt_html(slug))
    compact = text.replace(' ', '')
    missing = []
    for t in sorted(source_numbers(slug)):
        t_norm = norm(t)
        # EN "10 years"/"90 days" -> PT "10 anos"/"90 dias": só o número conta
        m = re.match(r'^(\d+)(?:-| )(year|years|day|days|month|months)$', t_norm, re.I)
        if m:
            if not re.search(r'(?<![\d,.$])' + m.group(1) + r'(?![\d])', text):
                missing.append(t)
            continue
        tc = t_norm.replace(' ', '')
        if tc not in compact:
            missing.append(t)
    return missing


class FidelityTest(unittest.TestCase):
    def test_no_invented_values_pt_dollar_and_percent_exist_in_source(self):
        for slug, p in PRODUCTS.items():
            with self.subTest(slug=slug):
                src = norm((FIX / p['fix']).read_text(encoding='utf-8').replace('\n', ' ')).replace('$ ', '$')
                txt = visible_text(pt_html(slug))
                pt = set(re.findall(r'\$\s?\d[\d,]*(?:\.\d+)?', txt)) | set(re.findall(r'\d+(?:\.\d+)?%', txt))
                extra = sorted(x.replace('$ ', '$').rstrip(',') for x in pt if x.replace('$ ', '$').rstrip(',') not in src)
                self.assertEqual(extra, [], f'{slug}: valores na página PT que não existem na fonte')

    def test_pages_exist(self):
        for slug in PRODUCTS:
            self.assertTrue((ACAD / f'docs/foresters-{slug}.html').is_file(), slug)
            self.assertTrue((ACAD / f'docs/pdf/foresters-{slug}.pdf').is_file(), slug)

    def test_originals_exist_and_match_fixture_code(self):
        for slug, p in PRODUCTS.items():
            f = ACAD / f'docs/pdf/foresters-{p["code"]}-{slug}-original.pdf'
            self.assertTrue(f.is_file(), f.name)
            self.assertEqual(f.read_bytes()[:5], b'%PDF-')

    def test_numbers_values_ages_percentages_terms_appear_in_pt_page(self):
        for slug in PRODUCTS:
            with self.subTest(slug=slug):
                self.assertEqual(tokens_missing(slug), [], f'{slug}: valores da fonte ausentes na página PT')

    def test_notice_code_and_not_for_public_use_are_preserved(self):
        for slug, p in PRODUCTS.items():
            with self.subTest(slug=slug):
                t = visible_text(pt_html(slug))
                self.assertIn(p['form'], t)
                self.assertIn('For Producer Use Only. Not For Use With The Public.', t)
                self.assertIn('vale o texto original em inglês', t)
                self.assertIn('Texto traduzido de PDFs oficiais fornecidos pelo proprietário em 20/11/2026; sem dados pessoais', t)
                self.assertIn('WDT AGENCY', t)
                self.assertIn('Teste seu conhecimento', t)
                self.assertIn(f'pdf/foresters-{p["code"]}-{slug}-original.pdf', pt_html(slug))
                self.assertIn(f'pdf/foresters-{slug}.pdf', pt_html(slug))

    def test_form_code_matches_original_pdf_text(self):
        for slug, p in PRODUCTS.items():
            src = norm((FIX / p['fix']).read_text(encoding='utf-8'))
            self.assertIn(p['form'], src, f'{slug}: form do original')

    def test_existing_guide_untouched_and_present(self):
        self.assertTrue((ACAD / 'docs/foresters-guia.html').is_file())
        self.assertEqual(hashlib.sha256((ACAD / 'docs/foresters-guia.html').read_bytes()).hexdigest(),
                         'a03c6c3d3ca81373c682dc7ce949051537c51649835e8f0d57ad0288ca7df2f3')

    def test_no_personal_data(self):
        pats = [r'[\w.+-]+@[\w-]+\.[\w.]+', r'\b\d{3}-\d{2}-\d{4}\b']
        allowed_phone = {'1-866-466-7166'}
        for slug, p in PRODUCTS.items():
            blobs = {f'html:{slug}': visible_text(pt_html(slug)),
                     f'fix:{slug}': (FIX / p['fix']).read_text(encoding='utf-8')}
            for name, b in blobs.items():
                for pat in pats:
                    self.assertEqual(re.findall(pat, b), [], f'{name}: {pat}')
                for ph in re.findall(r'\b\d-\d{3}-\d{3}-\d{4}\b', b):
                    self.assertIn(ph, allowed_phone, name)


class IndexTest(unittest.TestCase):
    def setUp(self):
        self.idx = (ACAD / 'index.html').read_text(encoding='utf-8')

    def test_every_local_link_in_index_exists(self):
        refs = set(re.findall(r'''['"]((?:docs|media|img)/[^'"\s?#]+\.(?:html|pdf|mp4|jpg|png))['"]''', self.idx))
        self.assertGreater(len(refs), 40)
        missing = sorted(r for r in refs if not (ACAD / r).is_file())
        self.assertEqual(missing, [])

    def test_foresters_has_pt_guide_and_original_for_each_product(self):
        m = re.search(r"\{n:'Foresters',.*?\n", self.idx)
        self.assertIsNotNone(m)
        assert m
        row = m.group(0)
        for slug, p in PRODUCTS.items():
            self.assertIn(f"'docs/foresters-{slug}.html'", row, slug)
            self.assertIn(f"'docs/pdf/foresters-{p['code']}-{slug}-original.pdf'", row, slug)
        self.assertEqual(row.count('Guia em português'), 4)
        self.assertEqual(row.count('Original (EN)'), 4)

    def test_previous_foresters_entries_and_order_preserved(self):
        m = re.search(r"\{n:'Foresters',.*?\n", self.idx)
        assert m
        row = m.group(0)
        self.assertIn("['Guia de estudo da Foresters','docs/foresters-guia.html']", row)
        self.assertIn("gn:['Ficha técnica ABR','Orphan Benefit']", row)
        self.assertIn("v:[['Term','media/cot-term-foresters.mp4'],['Whole Life','media/cot-wl-foresters.mp4']]", row)
        self.assertEqual(self.idx.count('docs/foresters-guia.html'), 4)  # lista de docs, carrier e 2 mats de cotação

    def test_lesson_materials_have_no_powerpoint(self):
        mats = '\n'.join(re.findall(r'mats:\[(.*?)\]', self.idx))
        self.assertNotIn("'pptx'", mats)

    def test_local_pdfs_are_not_loaded_as_html_doc(self):
        self.assertTrue(re.search(r"const isDoc = id => id\.startsWith\('docs/'\) && !id\.endsWith\('\.pdf'\)", self.idx),
                        'isDoc deve excluir .pdf locais (senão o PDF é carregado como HTML)')


class ReleaseRegistryTest(unittest.TestCase):
    """Registro de release: 248 anteriores + 3 capas = 251; os três vídeos grandes ficam fora do Git."""

    def setUp(self):
        self.man = json.loads((REL / 'manifest.json').read_text())
        self.allow = json.loads((REL / 'allowlist.json').read_text())
        self.auth = json.loads((REL / 'authorization.json').read_text())['academy-drive-videos-2026-11-20']
        self.want_new = {f'media/{name}.jpg' for name in ('aula-seguro-term', 'aula-treinamento-iul', 'aula-vendas-iul')}

    def test_manifest_allowlist_required_paths_consistent(self):
        paths = [a['path'] for a in self.man['assets']]
        self.assertEqual(len(paths), 251)
        self.assertEqual(len(set(paths)), 251)
        self.assertEqual(self.man['requiredPaths'], paths)
        self.assertEqual([a['path'] for a in self.allow], paths)
        self.assertTrue(self.want_new <= set(paths))
        self.assertEqual(len(self.want_new), 3)

    def test_registered_hashes_match_disk_and_are_approved(self):
        allow = {a['path']: a for a in self.allow}
        for a in self.man['assets']:
            self.assertIs(a['approved'], True, a['path'])
            self.assertEqual(hashlib.sha256((ACAD / a['path']).read_bytes()).hexdigest(), a['sha256'], a['path'])
            self.assertEqual(allow[a['path']]['sha256'], a['sha256'], a['path'])
        for p in self.want_new:
            self.assertEqual(allow[p]['provenance'], 'authorization.json#academy-drive-videos-2026-11-20', p)

    def test_authorization_records_owner_decision_provenance_and_limits(self):
        self.assertEqual(self.auth['counts'], {'previousAssets': 248, 'newAssets': 3, 'modifiedAssets': 1, 'totalAssets': 251, 'externalVideos': 3})
        self.assertIn('Treinamento para Agentes', self.auth['provenance'])
        self.assertIn('20/11/2026', self.auth['provenance'])
        self.assertEqual(self.auth['ownerDecision']['at'], '2026-11-20T18:43:52-05:00')
        self.assertTrue(any('fora do release versionado' in x for x in self.auth['limitations']))
        self.assertEqual({x['path'] for x in self.auth['newAssets']}, self.want_new)
        man = {a['path']: a['sha256'] for a in self.man['assets']}
        for x in self.auth['newAssets']:
            self.assertEqual(man[x['path']], x['sha256'])
        self.assertNotEqual(man['index.html'], self.auth['indexHtml']['previousSha256'])


if __name__ == '__main__':
    unittest.main()
