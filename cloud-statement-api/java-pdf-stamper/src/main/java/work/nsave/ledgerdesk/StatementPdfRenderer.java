package work.nsave.ledgerdesk;

import com.fasterxml.jackson.databind.JsonNode;
import com.lowagie.text.Document;
import com.lowagie.text.Image;
import com.lowagie.text.Rectangle;
import com.lowagie.text.pdf.BaseFont;
import com.lowagie.text.pdf.PdfContentByte;
import com.lowagie.text.pdf.PdfWriter;
import com.lowagie.text.pdf.PdfDate;
import com.lowagie.text.pdf.PdfName;
import com.lowagie.text.pdf.PdfString;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.text.NumberFormat;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Calendar;
import java.util.TimeZone;

/**
 * Native, single-pass statement renderer. The approved historical statement is
 * never read or edited: it is used only to measure layout and obtain static,
 * issuer-approved branding assets at build time. No white-box overlays.
 */
public final class StatementPdfRenderer {
    private static final float PAGE_W=612f, PAGE_H=792f;
    private static final Color INK=new Color(22,22,22);
    private static final Color MUTED=new Color(120,115,110);
    private static final Color RULE=new Color(231,229,228);
    private static final DateTimeFormatter DATE=DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final String FOOTER="© nsave Ltd. 2026 registered in England and Wales under number 14337994. npay USA Inc. is a company incorporated in Montana, USA and registered as a Money Services Business (MSB) with FinCEN under registration number: 31000342363468. GBP and Multi-Currency accounts are offered by Keel Money Ltd. authorised by the Financial Conduct Authority under the Electronic Money Regulations 2011 (FRN: 1020783) for the issuing of electronic money and payment instruments.";
    private final BaseFont regular,semibold;
    private final byte[] logo,seal;

    public StatementPdfRenderer() throws Exception {
        regular=font("/fonts/Inter-Regular-Static.ttf","Inter-Regular-Static.ttf");
        semibold=font("/fonts/Inter-SemiBold-Static.ttf","Inter-SemiBold-Static.ttf");
        logo=resource("/design/nsave-logo.png");
        seal=resource("/design/nsave-seal.png");
    }
    private static BaseFont font(String path,String name) throws Exception {
        return BaseFont.createFont(name,BaseFont.IDENTITY_H,BaseFont.EMBEDDED,true,resource(path),null);
    }

    public byte[] render(JsonNode s) throws Exception {
        validate(s);
        final int rows=s.path("transactions").size();
        // A larger statement is continued on newly generated pages. No source
        // PDF page, template stream, annotations, old metadata or old IDs are copied.
        final int perPage=4;
        final int totalPages=Math.max(1,(rows+perPage-1)/perPage);
        ByteArrayOutputStream out=new ByteArrayOutputStream();
        Document document=new Document(new Rectangle(PAGE_W,PAGE_H),0,0,0,0);
        PdfWriter writer=PdfWriter.getInstance(document,out);
        // One genuine issuance event: both dates refer to the same real instant.
        // Never inherit or backdate either timestamp from the design reference.
        Calendar issuedAt=Calendar.getInstance(TimeZone.getTimeZone("UTC"));
        writer.getInfo().put(PdfName.AUTHOR,new PdfString("None"));
        PdfDate timestamp=new PdfDate(issuedAt);
        writer.getInfo().put(PdfName.CREATIONDATE,timestamp);
        writer.getInfo().put(PdfName.MODDATE,new PdfDate(issuedAt));
        document.addTitle("Account Statement "+s.path("currency").asText());
        document.addSubject("Account statement "+s.path("from").asText()+" to "+s.path("to").asText());
        writer.setPdfVersion(PdfWriter.PDF_VERSION_1_7);
        document.open();
        try {
            for(int page=0;page<totalPages;page++){
                if(page>0)document.newPage();
                PdfContentByte c=writer.getDirectContent();
                drawHeader(c,s,page>0);
                if(page==0)drawCustomer(c,s);
                else drawContinuation(c);
                drawTable(c,s.path("transactions"),page*perPage,
                        Math.min(rows,(page+1)*perPage),s.path("currency").asText());
                drawSeal(c);
                drawFooter(c);
            }
        } finally { document.close(); }
        return out.toByteArray();
    }

    private void drawHeader(PdfContentByte c,JsonNode s,boolean continued) throws Exception {
        String header="Account Statement "+s.path("currency").asText()+(continued?" (continued)":"");
        text(c,semibold,header,continued?16f:20.6f,15.3f,683.4f,INK,520f);
        text(c,regular,date(s.path("from").asText())+" - "+date(s.path("to").asText()),
             13.8f,15.3f,660.0f,MUTED,360f);
        Image image=Image.getInstance(logo);
        image.scaleAbsolute(86.01f,23.23f);
        image.setAbsolutePosition(510.7f,680.69f);
        c.addImage(image);
    }

    private void drawCustomer(PdfContentByte c,JsonNode s) throws Exception {
        pair(c,"Name",s.path("customerName").asText(),629.9f,205f);
        label(c,"Address",15.3f,610.2f);
        List<String> address=wrap(s.path("address").asText(),regular,10.3f,210f);
        if(address.size()>3)throw new IllegalArgumentException("Address does not fit the approved master layout");
        for(int i=0;i<address.size();i++)text(c,regular,address.get(i),10.3f,158.1f,610.2f-i*12.9f,MUTED,215f);
        pair(c,"Bank",s.path("bankName").asText().toUpperCase(Locale.US),551.7f,210f);
        pair(c,"Bank Address",s.path("bankAddress").asText(),531.9f,355f);
        pair(c,"Account Number",s.path("accountNumber").asText(),512.1f,200f);
        String route=s.path("routingNumber").asText("");
        label(c,"Routing Number",15.3f,492.3f);
        text(c,regular,route,10.3f,158.1f,492.3f,MUTED,200f);

        String[] lbl={"Opening Balance","Closing Balance","Total Payments","Total Deposits"};
        String[] keys={"opening","closing","payments","deposits"};
        for(int i=0;i<lbl.length;i++){
            float y=512.1f-i*19.8f;
            label(c,lbl[i],366.7f,y);
            text(c,regular,money(s.path(keys[i]).asLong(),s.path("currency").asText()),
                 10.3f,509.5f,y,MUTED,94f);
        }
    }

    private void drawContinuation(PdfContentByte c) throws Exception {
        label(c,"Transactions continued",15.3f,629.5f);
    }
    private void drawTable(PdfContentByte c,JsonNode txs,int from,int until,String currency)throws Exception {
        final float headerY=416.6f, rowY=392.8f;
        text(c,regular,"Date",10.3f,15.3f,headerY,MUTED,90);
        text(c,regular,"Description",10.3f,118.1f,headerY,MUTED,275);
        text(c,regular,"Amount",10.3f,409.8f,headerY,MUTED,90);
        text(c,regular,"Balance",10.3f,557.9f,headerY,MUTED,46);
        line(c,8.4f,603.6f,407.03f);
        if(txs.isEmpty()){
            text(c,regular,"No rows to display.",10.3f,15.3f,rowY,MUTED,245f);
            line(c,8.4f,603.6f,386.68f);
            return;
        }
        for(int i=from;i<until;i++){
            JsonNode tx=txs.get(i);
            float y=rowY-(i-from)*18f;
            text(c,regular,date(tx.path("date").asText()),8.3f,15.3f,y,MUTED,95f);
            text(c,regular,tx.path("description").asText(),8.3f,118.1f,y,MUTED,270f);
            right(c,money(tx.path("amount").asLong(),currency),8.3f,410f,y,77f);
            right(c,tx.path("balance").isNull()?"—":money(tx.path("balance").asLong(),currency),
                    8.3f,535f,y,68f);
            line(c,8.4f,603.6f,y-8);
        }
    }

    private void drawSeal(PdfContentByte c)throws Exception {
        Image image=Image.getInstance(seal);
        image.scaleAbsolute(102.52f,102.53f);
        image.setAbsolutePosition(313.30f,326.79f);
        c.addImage(image);
    }
    private void drawFooter(PdfContentByte c)throws Exception {
        List<String> lines=wrap(FOOTER,regular,10.3f,585f);
        if(lines.size()>5)throw new IllegalStateException("Issuer disclosure exceeds allocated layout");
        for(int i=0;i<lines.size();i++)
            text(c,regular,lines.get(i),10.3f,13.6f,320.0f-i*12.9f,MUTED,585f);
    }

    private void pair(PdfContentByte c,String label,String value,float y,float max)throws Exception {
        label(c,label,15.3f,y);
        text(c,regular,value,10.3f,158.1f,y,MUTED,max);
    }
    private void label(PdfContentByte c,String t,float x,float y)throws Exception {
        text(c,semibold,t,10.3f,x,y,INK,138f);
    }
    private void line(PdfContentByte c,float from,float to,float y) {
        c.saveState();c.setColorStroke(RULE);c.setLineWidth(.85f);
        c.moveTo(from,y);c.lineTo(to,y);c.stroke();c.restoreState();
    }
    private void right(PdfContentByte c,String t,float size,float x,float y,float width)throws Exception {
        float textWidth=regular.getWidthPoint(t,size);
        if(textWidth>width)throw new IllegalArgumentException("Financial value exceeds allocated width");
        text(c,regular,t,size,x+width-textWidth,y,MUTED,width);
    }
    private void text(PdfContentByte c,BaseFont font,String t,float size,float x,float y,Color color,float width)throws Exception {
        if(t==null)throw new IllegalArgumentException("Missing PDF text");
        if(font.getWidthPoint(t,size)>width)throw new IllegalArgumentException("Field exceeds layout width");
        c.saveState();c.setColorFill(color);c.beginText();c.setFontAndSize(font,size);
        c.setTextMatrix(x,y);c.showText(t);c.endText();c.restoreState();
    }
    private static List<String> wrap(String value,BaseFont font,float size,float width){
        List<String> lines=new ArrayList<>();StringBuilder line=new StringBuilder();
        for(String word:value.trim().split("\\s+")){
            String test=line.length()==0?word:line+" "+word;
            if(font.getWidthPoint(test,size)>width && line.length()>0){
                lines.add(line.toString());line=new StringBuilder(word);
            }else line=new StringBuilder(test);
            if(font.getWidthPoint(line.toString(),size)>width)
                throw new IllegalArgumentException("Unbreakable text exceeds layout width");
        }
        if(line.length()>0)lines.add(line.toString());
        return lines;
    }
    private static String date(String value){return LocalDate.parse(value).format(DATE);}
    private static String money(long minor,String currency){
        NumberFormat f=NumberFormat.getCurrencyInstance(Locale.US);
        f.setCurrency(java.util.Currency.getInstance(currency));
        f.setMinimumFractionDigits(2);f.setMaximumFractionDigits(2);
        return f.format(BigDecimal.valueOf(minor,2));
    }
    private static byte[] resource(String path)throws IOException{
        try(InputStream in=StatementPdfRenderer.class.getResourceAsStream(path)){
            if(in==null)throw new IOException("Missing PDF rendering asset "+path);
            return in.readAllBytes();
        }
    }
    private static void validate(JsonNode s) {
        for(String k:new String[]{"requestReference","accountReference","customerName","address","bankName","bankAddress","accountNumber","currency","from","to"})
            if(s.path(k).asText().isBlank())throw new IllegalArgumentException("Missing statement field: "+k);
        if(!s.path("transactions").isArray())throw new IllegalArgumentException("transactions must be an array");
        if(!"USD".equals(s.path("currency").asText()))
            throw new IllegalArgumentException("Approved statement layout currently supports USD only");
        if(!s.path("routingNumber").asText("").matches("[0-9]{9}"))
            throw new IllegalArgumentException("Verified nine-digit routing number is required");
        for(String k:new String[]{"opening","closing","payments","deposits"})
            if(!s.path(k).isIntegralNumber())throw new IllegalArgumentException("Invalid balance value: "+k);
        if(Math.addExact(s.path("opening").asLong(),s.path("deposits").asLong())
            -s.path("payments").asLong()!=s.path("closing").asLong())
            throw new IllegalArgumentException("Statement balances do not reconcile");
        LocalDate start=LocalDate.parse(s.path("from").asText());
        LocalDate end=LocalDate.parse(s.path("to").asText());
        if(start.isAfter(end))throw new IllegalArgumentException("Invalid statement period");
    }
}
