#!/usr/bin/env python3
"""Synthetic regression checks; no live registry or user study data."""
import tempfile
import unittest
import sys
from pathlib import Path
from zipfile import ZipFile

sys.dont_write_bytecode = True
from extract_umin_docx import extract, NS


def p(text, num=None):
    props = f'<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="{num}"/></w:numPr></w:pPr>' if num else ''
    return f'<w:p>{props}<w:r><w:t>{text}</w:t></w:r></w:p>'


class ExtractionTests(unittest.TestCase):
    def run_source(self, body, numbering=''):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / 'synthetic.docx'
            with ZipFile(source, 'w') as z:
                z.writestr('word/document.xml', f'<w:document xmlns:w="{NS["w"]}"><w:body>{body}</w:body></w:document>')
                if numbering:
                    z.writestr('word/numbering.xml', f'<w:numbering xmlns:w="{NS["w"]}">{numbering}</w:numbering>')
            return extract(source)

    def test_auto_numbering_and_literal_numbers(self):
        definitions = ''.join(f'<w:abstractNum w:abstractNumId="{i}"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="{i}"><w:abstractNumId w:val="{i}"/></w:num>' for i in (3, 4))
        body = ''.join(p(f'include-{i}', 3) for i in range(7))
        body += ''.join(p(f'exclude-{i}', 4) for i in range(22)) + p('1. literal English')
        result = self.run_source(body, definitions)
        texts = [b['rendered'] for b in result['blocks']]
        self.assertEqual(texts[0], '1. include-0')
        self.assertEqual(texts[6], '7. include-6')
        self.assertEqual(texts[7], '1. exclude-0')
        self.assertEqual(texts[28], '22. exclude-21')
        self.assertEqual(texts[-1], '1. literal English')

    def test_checked_bullet_depends_on_definition_not_num_id(self):
        definitions = '<w:abstractNum w:abstractNumId="9"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="■"/></w:lvl></w:abstractNum><w:num w:numId="91"><w:abstractNumId w:val="9"/></w:num>'
        result = self.run_source(p('Japan', 91), definitions)
        self.assertEqual(result['blocks'][0]['rendered'], '■ Japan')

    def test_final_revisions_and_line_breaks(self):
        body = '<w:p><w:del><w:r><w:delText>OLD</w:delText></w:r></w:del><w:ins><w:r><w:t>NEW</w:t><w:br/><w:t>next</w:t></w:r></w:ins><w:moveFrom><w:r><w:t>FROM</w:t></w:r></w:moveFrom><w:moveTo><w:r><w:t>TO</w:t></w:r></w:moveTo></w:p>'
        result = self.run_source(body)
        self.assertEqual(result['blocks'][0]['text'], 'NEW\nnextTO')
        self.assertEqual(result['revision_count'], {'ins': 1, 'del': 1, 'moveFrom': 1, 'moveTo': 1})

    def test_table_rows_do_not_conflate_labels(self):
        body = p('Objectives') + '<w:tbl>' + ''.join('<w:tr>' + ''.join('<w:tc>' + p(t) + '</w:tc>' for t in row) + '</w:tr>' for row in [('目的2（主要アウトカム評価項目）', '安全性'), ('主要アウトカム評価項目', '体調アンケート')]) + '</w:tbl>'
        result = self.run_source(body)
        table = result['blocks'][1]
        self.assertEqual(table['preceding_paragraph'], 'Objectives')
        self.assertEqual(table['rows'][1]['cells'][1]['text'], '体調アンケート')
        self.assertNotEqual(table['rows'][0]['cells'][0]['text'], table['rows'][1]['cells'][0]['text'])

    def test_unresolved_numbering_warns(self):
        result = self.run_source(p('item', 55))
        self.assertTrue(result['warnings'])
        self.assertIsNone(result['blocks'][0]['numbering']['marker'])

    def test_start_override_is_respected(self):
        definitions = '<w:abstractNum w:abstractNumId="3"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="3"><w:abstractNumId w:val="3"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="5"/></w:lvlOverride></w:num>'
        result = self.run_source(p('item', 3) + p('next', 3), definitions)
        self.assertEqual([b['rendered'] for b in result['blocks']], ['5. item', '6. next'])

    def test_deleted_move_does_not_leak_highlights(self):
        body = '<w:p><w:moveFrom><w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>old selected</w:t></w:r></w:moveFrom><w:r><w:t>current</w:t></w:r></w:p>'
        result = self.run_source(body)
        self.assertEqual(result['blocks'][0]['text'], 'current')
        self.assertNotIn('highlights', result['blocks'][0])


if __name__ == '__main__':
    unittest.main()
