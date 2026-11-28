"""Extract public result tables and their SQL without executing notebook code."""
import argparse
import ast
from html.parser import HTMLParser
import json
from pathlib import Path

class Tables(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables, self.rows, self.row, self.cell = [], None, None, None
    def handle_starttag(self, tag, attrs):
        if tag == 'table': self.rows = []
        elif tag == 'tr' and self.rows is not None: self.row = []
        elif tag in ('td', 'th') and self.row is not None: self.cell = ''
    def handle_data(self, text):
        if self.cell is not None: self.cell += text
    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self.cell is not None:
            self.row.append(self.cell.strip()); self.cell = None
        elif tag == 'tr' and self.row is not None:
            if self.row: self.rows.append(self.row)
            self.row = None
        elif tag == 'table' and self.rows is not None:
            self.tables.append(self.rows); self.rows = None

LABELS = {
    6: 'Sample World Bank observations', 14: 'Dataset size: nine tables',
    15: 'Combined row count across selected tables', 17: 'Health indicator definition sample',
    18: 'Education indicator definition sample', 20: 'Education duplicate-key check',
    21: 'Country and aggregate catalog', 22: 'Health duplicate-key check',
    26: 'Education observation null audit', 27: 'Health observation null audit',
    28: 'Health duplicate-key count', 29: 'Education duplicate-key count',
    35: 'Under-5 mortality above each country’s historical mean',
    39: 'No education at ages 25+: years with a later decline',
    43: 'Youth literacy joined to ages 15–24 population',
    45: 'Same-year spending joined to no schooling at ages 15+',
    49: 'Education spending and the annual country mean',
    51: 'Youth mortality at ages 20–24: rank versus row number',
    54: 'Five highest mortality ranks per year: ages 10–14',
    59: 'Question 1: five highest youth-literacy averages',
    61: 'Question 1: youth literacy–spending correlation',
    65: 'Question 2: ten lowest adult-literacy averages',
    67: 'Question 2: adult literacy–spending correlation',
    71: 'Question 3: all 35 saved threshold matches',
    79: 'Question 3: ten-row query explanation example',
}

def sql_strings(source):
    # Read literals only. Never execute cells, authenticate, or contact BigQuery.
    try: tree = ast.parse(source)
    except SyntaxError: return []
    strings = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            value = node.value.strip()
            if 'bigquery-public-data.' in value and ('SELECT' in value or 'WITH' in value):
                strings.append(value)
    return strings

def extract(path):
    notebook = json.loads(Path(path).read_text())
    outputs = []
    for cell_index, cell in enumerate(notebook['cells']):
        if cell_index not in LABELS: continue
        sql = sql_strings(''.join(cell.get('source', [])))
        tables = []
        for output in cell.get('outputs', []):
            html = output.get('data', {}).get('text/html', [])
            parser = Tables(); parser.feed(html if isinstance(html, str) else ''.join(html))
            tables.extend(t for t in parser.tables if t)
        for number, table in enumerate(tables):
            columns, *rows = table
            if any(len(row) != len(columns) for row in rows):
                raise ValueError(f'Inconsistent table at cell {cell_index}')
            query = sql[min(number, len(sql)-1)] if sql else ''
            outputs.append({'id': f'cell-{cell_index}-{number}', 'cell': cell_index,
                            'title': LABELS[cell_index] + (f' ({columns[-1]})' if len(tables) > 1 else ''),
                            'category': 'Main findings' if cell_index in (59,61,65,67,71) else 'Supporting analysis' if cell_index >= 35 else 'Data audit & discovery',
                            'columns': columns, 'rows': rows, 'sql': query,
                            'limited': 'LIMIT' in query.upper()})
    return {'schemaVersion': 1,
            'provenance': 'Verbatim saved table outputs and SQL literals from Mario Portillo’s CS145 Project 1 notebook. No notebook code was executed. Original extract dates and complete contributing observation-year ranges are unknown. These historical BigQuery results are separate from the current World Bank API extract. LIMIT clauses and query definitions determine each result’s scope; samples are not full datasets.',
            'outputs': outputs}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('notebook', type=Path)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'web/data/notebook-archive.json')
    args = parser.parse_args()
    payload = extract(args.notebook)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'Extracted {len(payload["outputs"])} saved tables ({sum(len(t["rows"]) for t in payload["outputs"])} rows).')
