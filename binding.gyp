{
  "targets": [
    {
      "target_name": "omt",
      "sources": ["src/omt_binding.cpp"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "conditions": [
        ["OS=='linux'", {
          "sources":  ["src/omt_binding_stub.cpp"],
          "sources!": ["src/omt_binding.cpp"]
        }],
        ["OS=='mac'", {
          "include_dirs": ["lib/MacOS"],
          "libraries": ["<(module_root_dir)/lib/MacOS/libomt.dylib"],
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "OTHER_LDFLAGS": ["-Wl,-rpath,@loader_path"]
          },
          "copies": [{
            "destination": "<(PRODUCT_DIR)",
            "files": [
              "lib/MacOS/libomt.dylib",
              "lib/MacOS/libvmx.dylib"
            ]
          }]
        }],
        ["OS=='win' and target_arch=='x64'", {
          "include_dirs": ["lib/Winx64"],
          "libraries": ["<(module_root_dir)/lib/Winx64/libomt.lib"],
          "copies": [{
            "destination": "<(PRODUCT_DIR)",
            "files": [
              "lib/Winx64/libomt.dll",
              "lib/Winx64/libvmx.dll"
            ]
          }],
          "msvs_settings": {
            "VCCLCompilerTool": {"ExceptionHandling": 1}
          }
        }],
        ["OS=='win' and target_arch=='arm64'", {
          "include_dirs": ["lib/Winarm64"],
          "libraries": ["<(module_root_dir)/lib/Winarm64/libomt.lib"],
          "copies": [{
            "destination": "<(PRODUCT_DIR)",
            "files": [
              "lib/Winarm64/libomt.dll",
              "lib/Winarm64/libvmx.dll"
            ]
          }],
          "msvs_settings": {
            "VCCLCompilerTool": {"ExceptionHandling": 1}
          }
        }]
      ]
    }
  ]
}
