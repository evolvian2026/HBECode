#!/bin/sh
# Compile Main.cs + Solution.cs with Roslyn directly (no MSBuild), then write the runtime config.
set -eu
SDK_DIR=$(ls -d /opt/dotnet/sdk/8.* | head -n1)
REF_DIR=$(ls -d /opt/dotnet/packs/Microsoft.NETCore.App.Ref/8.*/ref/net8.0 | head -n1)
RT_VER=$(ls /opt/dotnet/shared/Microsoft.NETCore.App | grep '^8\.' | head -n1)
set --
for f in "$REF_DIR"/*.dll; do set -- "$@" "-r:$f"; done
/opt/dotnet/dotnet "$SDK_DIR/Roslyn/bincore/csc.dll" -nologo -noconfig -langversion:12 -optimize+ \
  -nullable:disable -warn:0 -target:exe -out:main.dll "$@" Main.cs Solution.cs
cat > main.runtimeconfig.json <<JSON
{"runtimeOptions":{"tfm":"net8.0","framework":{"name":"Microsoft.NETCore.App","version":"$RT_VER"},"configProperties":{"System.Globalization.Invariant":true,"System.GC.Concurrent":false}}}
JSON
