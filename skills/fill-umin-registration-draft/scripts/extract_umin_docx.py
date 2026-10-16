#!/usr/bin/env python3
"""Read UMIN DOCX source structure without sending data or changing the document.

Support single-level decimal/bullet numbering; flag layout and numbering that
need visual inspection. This is a transcription aid, not a Word renderer.
"""

import argparse
import json
import re
from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
W = "{" + NS["w"] + "}"
OMIT = {W + "del", W + "moveFrom"}


def val(element, default=None):
    return element.get(W + "val", default) if element is not None else default


def final_text(element):
    if element.tag in OMIT:
        return ""
    if element.tag == W + "t":
        return element.text or ""
    if element.tag in {W + "br", W + "cr"}:
        return "\n"
    if element.tag == W + "tab":
        return "\t"
    return "".join(final_text(child) for child in element)


def final_runs(element):
    if element.tag in OMIT:
        return
    if element.tag == W + "r":
        yield element
    else:
        for child in element:
            yield from final_runs(child)


class Extractor:
    def __init__(self, archive):
        self.warnings = []
        self.counters = {}
        self.document = ET.fromstring(archive.read("word/document.xml"))
        self.numbering = self.read_optional(archive, "word/numbering.xml")
        styles = self.read_optional(archive, "word/styles.xml")
        self.styles = {
            e.get(W + "styleId"): e for e in styles.findall("w:style", NS)
        } if styles is not None else {}

    @staticmethod
    def read_optional(archive, name):
        return ET.fromstring(archive.read(name)) if name in archive.namelist() else None

    def warn(self, where, reason):
        self.warnings.append({"location": where, "reason": reason})

    def num_properties(self, paragraph):
        props = paragraph.find("w:pPr/w:numPr", NS)
        if props is not None:
            return props
        style_id = val(paragraph.find("w:pPr/w:pStyle", NS))
        seen = set()
        while style_id and style_id not in seen:
            seen.add(style_id)
            style = self.styles.get(style_id)
            if style is None:
                break
            props = style.find("w:pPr/w:numPr", NS)
            if props is not None:
                return props
            style_id = val(style.find("w:basedOn", NS))
        return None

    def marker(self, paragraph, where):
        props = self.num_properties(paragraph)
        if props is None:
            return None
        num_id = val(props.find("w:numId", NS))
        level = val(props.find("w:ilvl", NS), "0")
        if num_id == "0":
            return None
        info = {"num_id": num_id, "level": level, "marker": None}
        if num_id is None or self.numbering is None:
            self.warn(where, "Numbering definition is missing; inspect the Word view.")
            return info
        num = self.numbering.find(f'w:num[@w:numId="{num_id}"]', NS)
        abstract_id = val(num.find("w:abstractNumId", NS)) if num is not None else None
        abstract = self.numbering.find(
            f'w:abstractNum[@w:abstractNumId="{abstract_id}"]', NS
        ) if abstract_id is not None else None
        override = num.find(f'w:lvlOverride[@w:ilvl="{level}"]', NS) if num is not None else None
        definition = override.find("w:lvl", NS) if override is not None else None
        if definition is None and abstract is not None:
            definition = abstract.find(f'w:lvl[@w:ilvl="{level}"]', NS)
        if definition is None:
            self.warn(where, "Numbering level could not be resolved; inspect the Word view.")
            return info
        fmt = val(definition.find("w:numFmt", NS))
        template = val(definition.find("w:lvlText", NS), "")
        info.update(format=fmt, template=template)
        if level != "0" or definition.find("w:lvlRestart", NS) is not None:
            self.warn(where, "Multilevel/restart numbering needs visual inspection.")
            return info
        if fmt == "bullet":
            info["marker"] = template
            if any(0xE000 <= ord(c) <= 0xF8FF for c in template):
                self.warn(where, "Font-dependent bullet symbol needs visual inspection.")
            return info
        if fmt != "decimal" or re.search(r"%[2-9]", template):
            self.warn(where, "Unsupported numbering format; do not infer its display.")
            return info
        start = val(override.find("w:startOverride", NS)) if override is not None else None
        start = start if start is not None else val(definition.find("w:start", NS), "1")
        key = (num_id, level)
        self.counters[key] = self.counters.get(key, int(start) - 1) + 1
        info["marker"] = template.replace("%1", str(self.counters[key]))
        return info

    def paragraph(self, element, where):
        text = final_text(element)
        number = self.marker(element, where)
        marker = number["marker"] if number else None
        rendered = f"{marker} {text}" if marker else text
        if marker and re.match(r"^\s*\d+[.)]", text):
            self.warn(where, "Both automatic and literal numbering appear; check for duplication.")
        highlights = []
        for run in final_runs(element):
            h = val(run.find("w:rPr/w:highlight", NS))
            if h and final_text(run):
                highlights.append({"text": final_text(run), "highlight": h})
        result = {"text": text, "rendered": rendered}
        if number:
            result["numbering"] = number
        if highlights:
            result["highlights"] = highlights
        return result

    def extract(self):
        body = self.document.find("w:body", NS)
        blocks = []
        context = ""
        table_index = 0
        for index, child in enumerate(body):
            if child.tag == W + "p":
                item = self.paragraph(child, f"body/p{index}")
                blocks.append({"type": "paragraph", **item})
                if item["text"].strip():
                    context = item["text"]
            elif child.tag == W + "tbl":
                rows = []
                for ri, row in enumerate(child.findall("w:tr", NS)):
                    cells = []
                    for ci, cell in enumerate(row.findall("w:tc", NS)):
                        where = f"table{table_index}/row{ri}/cell{ci}"
                        if cell.find("w:tbl", NS) is not None:
                            self.warn(where, "Nested table needs visual inspection.")
                        if cell.find("w:tcPr/w:vMerge", NS) is not None or cell.find("w:tcPr/w:gridSpan", NS) is not None:
                            self.warn(where, "Merged cell: verify its row/language association visually.")
                        paragraphs = [self.paragraph(p, f"{where}/p{pi}")
                                      for pi, p in enumerate(cell.findall("w:p", NS))]
                        cells.append({"text": "\n".join(p["rendered"] for p in paragraphs).strip("\n"),
                                      "paragraphs": paragraphs})
                    rows.append({"row_index": ri, "cells": cells})
                blocks.append({"type": "table", "table_index": table_index,
                               "preceding_paragraph": context, "rows": rows})
                table_index += 1
            elif child.tag != W + "sectPr":
                self.warn(f"body/{index}", "Unsupported body element; inspect the Word view.")
        for tag in ("drawing", "pict", "sym", "txbxContent", "altChunk", "sdt"):
            if self.document.find(f".//w:{tag}", NS) is not None:
                self.warn("document", f"Contains {tag}; inspect content not represented by plain paragraphs.")
        revision_count = {tag: len(self.document.findall(f".//w:{tag}", NS))
                          for tag in ("ins", "del", "moveFrom", "moveTo")}
        return {"view": "final_text_without_accepting_changes", "revision_count": revision_count,
                "blocks": blocks, "warnings": self.warnings}


def extract(path):
    with ZipFile(path) as archive:
        return Extractor(archive).extract()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = json.dumps(extract(args.source), ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.write_text(result, encoding="utf-8")
    else:
        print(result, end="")


if __name__ == "__main__":
    main()
