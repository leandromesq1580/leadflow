"""Chromium real contra um servidor estático local de public/academy.

Cobre: navegação Seguradoras > Foresters > cada guia PT e cada original EN, rota #m-c2-2
(vídeo de cotação Whole Life Foresters) e ausência de erros de JS, em desktop, 1280 e mobile.
Requer playwright + chromium; sem eles o teste é PULADO (não conta como verde de browser).
"""
import functools
import http.server
import re
import threading
import unittest
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover
    sync_playwright = None

ACAD = Path(__file__).resolve().parents[1] / 'public/academy'
SLUGS = [('SMART UL', 'smart-ul', '503346'), ('Level Term', 'level-term', '504387'),
         ('Live Well Plus', 'live-well-plus', '506014'), ('Advantage Plus II', 'advantage-plus-ii', '504933')]
VIEWPORTS = {'desktop': (1920, 1080), '1280': (1280, 800), 'mobile': (390, 844)}


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


@unittest.skipIf(sync_playwright is None, 'playwright indisponível')
class BrowserTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        handler = functools.partial(Quiet, directory=str(ACAD))
        cls.srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
        cls.base = f'http://127.0.0.1:{cls.srv.server_port}'
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.srv.shutdown()

    def page(self, vp):
        ctx = self.browser.new_context(viewport={'width': VIEWPORTS[vp][0], 'height': VIEWPORTS[vp][1]})
        pg = ctx.new_page()
        pg.errors = []
        pg.on('pageerror', lambda e: pg.errors.append(f'pageerror: {e}'))
        pg.on('console', lambda m: pg.errors.append(f'console: {m.text}') if m.type == 'error' and 'fonts.g' not in m.text and 'ERR_' not in m.text else None)
        return ctx, pg

    def foresters_index(self, pg):
        pg.goto(self.base + '/index.html')
        return pg.evaluate("MODULES.findIndex(m=>m.n==='Foresters')"), pg.evaluate("MODULES.find(m=>m.n==='Foresters').k")

    def test_foresters_guides_and_originals_navigable(self):
        for vp in VIEWPORTS:
            ctx, pg = self.page(vp)
            with self.subTest(vp=vp):
                _, key = self.foresters_index(pg)
                lessons = pg.evaluate("MODULES.find(m=>m.n==='Foresters').lessons.map(l=>[l.n,l.id,l.t])")
                names = [l[0] for l in lessons]
                for name, slug, code in SLUGS:
                    gi = next(i for i, l in enumerate(lessons) if l[1] == f'docs/foresters-{slug}.html')
                    oi = next(i for i, l in enumerate(lessons) if l[1] == f'docs/pdf/foresters-{code}-{slug}-original.pdf')
                    self.assertEqual(oi, gi + 1, f'{name}: original deve vir logo após o guia')
                    self.assertIn('Guia em português', names[gi])
                    self.assertIn('Original (EN)', names[oi])
                    # guia PT: abre no iframe e renderiza título
                    pg.goto(f'{self.base}/index.html#m-{key}-{gi}')
                    pg.wait_for_selector('iframe.docframe')
                    frame = pg.frame_locator('iframe.docframe')
                    frame.locator('h1').first.wait_for(timeout=8000)
                    self.assertIn('Foresters', frame.locator('h1').first.inner_text())
                    self.assertIn('Tradução de apoio', frame.locator('.legal').first.inner_text())
                    # original EN: link local para PDF que responde 200 e é PDF
                    pg.goto(f'{self.base}/index.html#m-{key}-{oi}')
                    pg.wait_for_selector('.player a.cover')
                    href = pg.get_attribute('.player a.cover', 'href')
                    self.assertEqual(href, f'docs/pdf/foresters-{code}-{slug}-original.pdf')
                    r = pg.request.get(f'{self.base}/{href}')
                    self.assertEqual(r.status, 200)
                    self.assertEqual(r.body()[:5], b'%PDF-')
                    self.assertEqual(pg.locator('iframe.docframe').count(), 0, 'PDF não pode ser carregado como HTML')
                self.assertEqual(pg.errors, [])
            ctx.close()

    def test_no_horizontal_overflow_on_guides(self):
        for vp in VIEWPORTS:
            ctx, pg = self.page(vp)
            for name, slug, code in SLUGS:
                with self.subTest(vp=vp, slug=slug):
                    pg.goto(f'{self.base}/docs/foresters-{slug}.html')
                    ov = pg.evaluate("document.documentElement.scrollWidth - window.innerWidth")
                    self.assertLessEqual(ov, 2, f'overflow horizontal {ov}px')
                    self.assertEqual(pg.errors, [])
            ctx.close()

    def test_route_m_c2_2_still_works(self):
        for vp in VIEWPORTS:
            ctx, pg = self.page(vp)
            with self.subTest(vp=vp):
                pg.goto(self.base + '/index.html#m-c2-2')
                pg.wait_for_selector('#mview.on h1')
                self.assertEqual(pg.inner_text('#mview h1'), 'Foresters')
                self.assertIn('Cotação Whole Life', pg.inner_text('#mview .crumb'))
                self.assertIn('Guia de estudo da Foresters', pg.inner_text('#mview .mats'))
                self.assertEqual(pg.get_attribute('#mview .mat', 'href'), 'docs/foresters-guia.html')
                pg.wait_for_selector('#mview video')
                self.assertEqual(pg.errors, [])
            ctx.close()

    def test_old_guide_loads(self):
        ctx, pg = self.page('1280')
        pg.goto(self.base + '/docs/foresters-guia.html')
        self.assertIn('Foresters', pg.inner_text('h1'))
        self.assertEqual(pg.errors, [])
        ctx.close()


if __name__ == '__main__':
    unittest.main()
