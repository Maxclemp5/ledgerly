# Inter fonts in the Docker image

The Dockerfile installs the licensed fonts-inter Debian package and copies all 18 static font
variants from /usr/share/fonts/opentype/inter into src/main/resources/fonts before Maven packaging.

Do not commit TTF or OTF binaries. Font license notice is included inside the built JAR.
