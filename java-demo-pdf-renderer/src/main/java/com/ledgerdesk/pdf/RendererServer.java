package com.ledgerdesk.pdf;

import com.lowagie.text.pdf.*;
import com.sun.net.httpserver.*;
import java.awt.Color;
import java.io.*;
import java.math.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.Executors;

/**
 * Protected OpenPDF renderer for clearly marked DEMO account summaries.
 * The only permitted input is server-provided, masked, demo-only customer data.
 */
public final class RendererServer {
  private static final String TOKEN=System.getenv().getOrDefault("RENDERER_TOKEN","");
  private static final String[] STYLES={"Thin","ExtraLight","Light","Regular","Medium",
    "SemiBold","Bold","ExtraBold","Black","ThinItalic","ExtraLightItalic",
    "LightItalic","Italic","MediumItalic","SemiBoldItalic","BoldItalic",
    "ExtraBoldItalic","BlackItalic"};
  private static final DateTimeFormatter DATE=DateTimeFormatter.ofPattern("dd/MM/yyyy",Locale.US);
  private static final byte[] TEMPLATE=resource(PdfTemplatePaths.DEMO_SUMMARY);
  private static final Map<String,BaseFont> FONTS=loadFonts();

  private static byte[] resource(String path){
    try(InputStream in=RendererServer.class.getResourceAsStream(path)){
      if(in==null)throw new IllegalStateException("Missing PDF resource: "+path);
      return in.readAllBytes();
    }catch(IOException e){throw new IllegalStateException("Cannot read resource: "+path,e);}
  }
  private static Map<String,BaseFont> loadFonts(){
    Map<String,BaseFont> fonts=new LinkedHashMap<>();
    for(String style:STYLES){
      String filename="Inter-"+style+".otf";
      try{
        BaseFont font=BaseFont.createFont(filename,BaseFont.IDENTITY_H,
          BaseFont.EMBEDDED,true,resource("/fonts/"+filename),null);
        font.setSubset(false);
        if(!font.isEmbedded())throw new IllegalStateException("Font not embedded");
        fonts.put(style,font);
      }catch(Exception e){throw new IllegalStateException("Inter font failed: "+style,e);}
    }
    return Collections.unmodifiableMap(fonts);
  }
  private static BaseFont font(String style){return FONTS.get(style);}
  private static String clean(String value,BaseFont f){
    String s=(value==null?"":value).replaceAll("[\\r\\n\\t\\x00-\\x1F]"," ").strip();
    StringBuilder result=new StringBuilder();
    s.codePoints().forEach(cp->result.appendCodePoint(f.charExists(cp)?cp:'?'));
    return result.toString();
  }
  private static void text(PdfContentByte p,String style,float size,float x,float y,String value){
    BaseFont f=font(style);
    p.beginText();p.setFontAndSize(f,size);p.setTextMatrix(x,y);
    p.showText(clean(value,f));p.endText();
  }
  private static void right(PdfContentByte p,String style,float size,float x,float y,String value){
    BaseFont f=font(style);String s=clean(value,f);
    text(p,style,size,x-f.getWidthPoint(s,size),y,s);
  }
  private static String decoded(Properties p,String key){
    String b64=p.getProperty(key);
    if(b64==null||b64.isEmpty()||b64.length()>1400)
      throw new IllegalArgumentException("Missing/invalid field "+key);
    byte[] bytes;
    try{bytes=Base64.getDecoder().decode(b64);}
    catch(IllegalArgumentException e){throw new IllegalArgumentException("Invalid base64");}
    String value=new String(bytes,StandardCharsets.UTF_8);
    if(value.length()>250)throw new IllegalArgumentException("Field too long");
    return value.replaceAll("[\\r\\n\\t\\x00-\\x1F]"," ").strip();
  }
  private static String masked(Properties p,String key){
    String value=p.getProperty(key,"");
    if(!value.matches("\\*{4}[0-9]{0,4}"))
      throw new IllegalArgumentException("Masked identifier required");
    return value;
  }
  private static String amount(BigDecimal value){
    return "$"+String.format(Locale.US,"%,.2f",value.setScale(2,RoundingMode.HALF_UP));
  }
  /** PdfReader -> PdfStamper -> getOverContent(1) -> stamper.close(). */
  public static byte[] render(Properties p)throws Exception{
    if(!"true".equals(p.getProperty("demo_only")))throw new IllegalArgumentException("Demo flag required");
    if(!p.getProperty("customer_id","").matches("[A-Za-z0-9_-]{1,100}"))
      throw new IllegalArgumentException("Invalid customer ID");
    if(!"USD".equals(p.getProperty("currency")))throw new IllegalArgumentException("USD only");
    LocalDate from=LocalDate.parse(p.getProperty("from",""));
    LocalDate to=LocalDate.parse(p.getProperty("to",""));
    if(from.isAfter(to))throw new IllegalArgumentException("Invalid date period");
    BigDecimal opening=new BigDecimal(p.getProperty("opening_balance","0.00"));
    if(opening.signum()<0||opening.scale()>2||opening.compareTo(new BigDecimal("1000000000"))>0)
      throw new IllegalArgumentException("Invalid demo balance");
    String name=decoded(p,"name_b64"),address=decoded(p,"address1_b64");
    String city=decoded(p,"address2_b64"),country=decoded(p,"country_b64");
    String bank=decoded(p,"bank_b64"),bankAddress=decoded(p,"bank_address_b64");
    String account=masked(p,"account_masked"),routing=masked(p,"routing_masked");
    ByteArrayOutputStream output=new ByteArrayOutputStream();
    PdfReader reader=new PdfReader(TEMPLATE);
    try{
      PdfStamper stamper=new PdfStamper(reader,output);
      try{
        PdfContentByte over=stamper.getOverContent(1);
        over.setColorFill(new Color(30,48,73));
        text(over,"Regular",9,126,691,from.format(DATE)+" - "+to.format(DATE));
        text(over,"SemiBold",10,190,653,name);
        text(over,"Regular",10,190,633,address);
        text(over,"Regular",10,190,613,city);
        text(over,"Regular",10,190,593,country);
        text(over,"SemiBold",10,240,561,bank);
        text(over,"Regular",9,190,541,bankAddress);
        text(over,"Regular",10,190,521,account);
        text(over,"Regular",10,190,501,routing);
        right(over,"SemiBold",9,537,489,amount(opening));
        right(over,"SemiBold",9,537,471,amount(opening));
        right(over,"SemiBold",9,537,453,"$0.00");
        right(over,"SemiBold",9,537,435,"$0.00");
      }finally{stamper.close();}
    }finally{reader.close();}
    return output.toByteArray();
  }
  private static boolean authorized(HttpExchange e){
    String value=e.getRequestHeaders().getFirst("X-Renderer-Token");
    return !TOKEN.isBlank()&&value!=null&&
      MessageDigest.isEqual(value.getBytes(StandardCharsets.UTF_8),
        TOKEN.getBytes(StandardCharsets.UTF_8));
  }
  private static void reply(HttpExchange e,int status,String value)throws Exception{
    byte[] b=value.getBytes(StandardCharsets.UTF_8);
    e.getResponseHeaders().set("Content-Type","text/plain; charset=utf-8");
    e.getResponseHeaders().set("Cache-Control","no-store");
    e.sendResponseHeaders(status,b.length);
    try(OutputStream o=e.getResponseBody()){o.write(b);}
  }
  public static void main(String[] args)throws Exception{
    if(args.length==1&&"--self-test".equals(args[0])){
      Properties p=new Properties();
      p.setProperty("demo_only","true");p.setProperty("customer_id","cus_fixture_001");
      p.setProperty("currency","USD");p.setProperty("from","2026-11-01");
      p.setProperty("to","2026-11-22");p.setProperty("opening_balance","75.50");
      for(String k:new String[]{"name","address1","address2","country","bank","bank_address"})
        p.setProperty(k+"_b64",Base64.getEncoder().encodeToString("DEMO SANDBOX TEST".getBytes(StandardCharsets.UTF_8)));
      p.setProperty("account_masked","****0000");
      p.setProperty("routing_masked","****0000");
      byte[] pdf=render(p);PdfReader r=new PdfReader(pdf);
      try{
        if(r.getNumberOfPages()!=1||pdf.length<1000)
          throw new IllegalStateException("PDF self-test failed");
        System.out.println("OpenPDF self-test passed: bytes="+pdf.length+", fonts="+FONTS.size());
      }finally{r.close();}
      return;
    }
    int port=Integer.parseInt(System.getenv().getOrDefault("PORT","8080"));
    HttpServer server=HttpServer.create(new InetSocketAddress("0.0.0.0",port),16);
    server.createContext("/health",e->{
      try{reply(e,200,"ok; demo=true; Inter-styles="+FONTS.size());}
      catch(Exception ignored){}
    });
    server.createContext("/render",e->{
      try{
        if(!"POST".equals(e.getRequestMethod())){reply(e,405,"POST required");return;}
        if(!authorized(e)){reply(e,401,"Not authorized");return;}
        byte[] body;
        try(InputStream in=e.getRequestBody()){body=in.readNBytes(100001);}
        if(body.length>100000){reply(e,413,"Payload too large");return;}
        Properties p=new Properties();
        p.load(new InputStreamReader(new ByteArrayInputStream(body),StandardCharsets.UTF_8));
        byte[] pdf=render(p);
        e.getResponseHeaders().set("Content-Type","application/pdf");
        e.getResponseHeaders().set("Content-Disposition","attachment; filename=\"demo-account-activity.pdf\"");
        e.getResponseHeaders().set("Cache-Control","private, no-store");
        e.getResponseHeaders().set("X-Content-Type-Options","nosniff");
        e.sendResponseHeaders(200,pdf.length);
        try(OutputStream out=e.getResponseBody()){out.write(pdf);}
      }catch(IllegalArgumentException ex){
        try{reply(e,422,"Demo input validation failed");}catch(Exception ignored){}
      }catch(Exception ex){
        System.err.println("Renderer failed: "+ex.getClass().getSimpleName());
        try{reply(e,500,"Java PDF renderer unavailable");}catch(Exception ignored){}
      }finally{e.close();}
    });
    server.setExecutor(Executors.newFixedThreadPool(4));
    server.start();
    System.out.println("Ledger Desk DEMO Java renderer listening on "+port);
  }
}
