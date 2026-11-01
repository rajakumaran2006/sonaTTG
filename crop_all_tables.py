import pymupdf

doc = pymupdf.open('Odd Sem All Class TimeTable.pdf')
zoom = 150 / 72
mat = pymupdf.Matrix(zoom, zoom)

pages_to_crop = [
    (1, 'it_iv_a_prac'),
    (3, 'it_iv_b_prac'),
    (5, 'it_iv_c_prac'),
    (6, 'it_iii_a_full'),
    (7, 'it_iii_b_full'),
    (8, 'it_iii_c_full'),
    (9, 'it_ii_a_full'),
    (10, 'it_ii_b_full'),
    (11, 'it_ii_c_full'),
    (13, 'aids_iv_a_prac'),
    (15, 'aids_iv_b_prac'),
    (17, 'aids_iv_c_prac'),
    (18, 'aids_iii_a_full'),
    (19, 'aids_iii_b_full'),
    (20, 'aids_iii_c_full'),
    (21, 'aids_ii_a_full'),
    (22, 'aids_ii_b_full'),
    (23, 'aids_ii_c_full'),
]

for p, name in pages_to_crop:
    page = doc[p]
    if 'full' in name:
        # crop bottom half where tables are: y=250 to 580 (height is ~595)
        rect = pymupdf.Rect(0, 240, page.rect.width, page.rect.height)
    else:
        # on odd pages for year 4, the practical table and OE list are on top/mid: y=0 to 450
        rect = pymupdf.Rect(0, 0, page.rect.width, 450)
    pix = page.get_pixmap(matrix=mat, clip=rect)
    pix.save(f'check_{name}.png')

print('Cropped all relevant pages.')
