#!/usr/bin/env python3
"""Gera docs/academy-release/pending-foresters-guias.json (registro PENDENTE, não aprovado).

Não altera manifest.json, allowlist.json nem authorization.json: esses arquivos só mudam
depois da autorização explícita do dono para publicar. Rode de novo após qualquer edição
nos arquivos listados abaixo (hashes SHA-256 devem bater com o disco; há teste para isso).
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ACAD = ROOT / 'public/academy'
REL = ROOT / 'docs/academy-release'
PRODUCTS = [('smart-ul', '503346', '04/20'), ('level-term', '504387', '05/21'),
            ('live-well-plus', '506014', '04/25'), ('advantage-plus-ii', '504933', '03/20')]


def sha(rel):
    return hashlib.sha256((ACAD / rel).read_bytes()).hexdigest()


def main():
    live = json.loads((REL / 'manifest.json').read_text())
    base = {a['path']: a['sha256'] for a in live['assets']}
    paths = ['index.html']
    for slug, code, _ in PRODUCTS:
        paths += [f'docs/foresters-{slug}.html', f'docs/pdf/foresters-{slug}.pdf',
                  f'docs/pdf/foresters-{code}-{slug}-original.pdf']
    out = {
        'schemaVersion': 1,
        'publicationApproved': False,
        'status': 'PENDENTE: aguardando autorização explícita (sim) do dono; manifest/allowlist/authorization publicados NÃO foram alterados',
        'provenance': 'texto traduzido de PDFs oficiais fornecidos pelo proprietário em 20/11/2026; sem dados pessoais',
        'sources': [{'product': s, 'form': f'{c} US {d}', 'original': f'docs/pdf/foresters-{c}-{s}-original.pdf'}
                    for s, c, d in PRODUCTS],
        'baseline': {'index.html': base['index.html'], 'docs/foresters-guia.html': base['docs/foresters-guia.html']},
        'assets': [{'path': p, 'sha256': sha(p), 'approved': False,
                    'kind': 'modified' if p == 'index.html' else 'new'} for p in paths],
        'onPublish': [
            'git add -f dos 13 arquivos (public/academy é ignorado)',
            'adicionar os 12 novos ao allowlist.json e manifest.json e atualizar o hash de index.html',
            'registrar a decisão em authorization.json e subir requiredPaths/assets de 236 para 249',
            'rodar scripts/academy-stage.py com o manifesto novo e conferir hashes',
        ],
    }
    (REL / 'pending-foresters-guias.json').write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n')
    print(len(paths), 'assets')


if __name__ == '__main__':
    main()
