#!/usr/bin/env python3
"""Extract only the approved static artwork, never any customer data, from a design reference.

The resulting Java renderer starts with a new blank PDF; it never imports a page
or stamps values over an existing statement. Assets are isolated logo and seal PNGs.
"""
from pathlib import Path
import io
import fitz
from PIL import Image, ImageDraw
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

root=Path(__file__).resolve().parents[1]
src=root/"src/main/resources/template/nsave-statement-template.pdf"
out=root/"src/main/resources/design"
out.mkdir(parents=True,exist_ok=True)
doc=fitz.open(src)
assert len(doc)==1 and abs(doc[0].rect.width-612)<1 and abs(doc[0].rect.height-792)<1
page=doc[0]
# Static artwork only, measured on the approved reference in PDF points.
for name, rect in [
    ("nsave-logo", fitz.Rect(510.70,88.08,596.72,111.31)),
    ("nsave-seal", fitz.Rect(313.30,362.68,415.82,465.21))
]:
    pix=page.get_pixmap(matrix=fitz.Matrix(4,4),clip=rect,alpha=False)
    im=Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGBA")
    if name=="nsave-seal":
        # Keep just the circular printed seal; remove nearby table text/lines.
        w,h=im.size
        mask=Image.new("L",(w,h),0)
        d=ImageDraw.Draw(mask)
        pad=2
        d.ellipse((pad,pad,w-pad-1,h-pad-1),fill=255)
        im.putalpha(mask)
    im.save(out/(name+".png"),optimize=True)
doc.close()
# Instantiate the Inter variable font to *actual static* regular and semi-bold
# weights so that all values/labels share the same family as the reference.
fontroot=root/"src/main/resources/fonts"
variable=fontroot/"Inter-Regular.ttf"
for weight,label in ((400,"Regular"),(600,"SemiBold")):
    font=TTFont(variable)
    axes={a.axisTag:a.defaultValue for a in font["fvar"].axes}
    axes["wght"]=weight
    instantiateVariableFont(font,axes,inplace=True)
    font.save(fontroot/("Inter-"+label+"-Static.ttf"))
print("Extracted static brand artwork and instantiated two matching Inter fonts.")
