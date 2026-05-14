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
        ["OS=='linux' and target_arch=='x64'", {
          "include_dirs": ["lib/linux-amd64"],
          "libraries": ["<(module_root_dir)/lib/linux-amd64/libomt.so"],
          "ldflags": ["-Wl,-rpath,'$$ORIGIN'"],
          "copies": [{
            "destination": "<(PRODUCT_DIR)",
            "files": ["lib/linux-amd64/libomt.so"]
          }]
        }],
        ["OS=='linux' and target_arch=='arm64'", {
          "include_dirs": ["lib/linux-arm64"],
          "libraries": ["<(module_root_dir)/lib/linux-arm64/libomt.so"],
          "ldflags": ["-Wl,-rpath,'$$ORIGIN'"],
          "copies": [{
            "destination": "<(PRODUCT_DIR)",
            "files": ["lib/linux-arm64/libomt.so"]
          }]
        }],
        ["OS=='mac'", {
          "include_dirs": ["lib/macos"],
          "libraries": ["<(module_root_dir)/lib/macos/libomt.dylib"],
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "OTHER_LDFLAGS": ["-Wl,-rpath,@loader_path"]
          },
          "copies": [{
            "destination": "<(PRODUCT_DIR)",
            "files": [
              "lib/macos/libomt.dylib",
              "lib/macos/libvmx.dylib"
            ]
          }]
        }],
        ["OS=='win' and target_arch=='x64'", {
          "include_dirs": ["lib/win-x64"],
          "libraries": ["<(module_root_dir)/lib/win-x64/libomt.lib"],
          "copies": [{
            "destination": "<(PRODUCT_DIR)",
            "files": [
              "lib/win-x64/libomt.dll",
              "lib/win-x64/libvmx.dll"
            ]
          }],
          "msvs_settings": {
            "VCCLCompilerTool": {"ExceptionHandling": 1}
          }
        }],
        ["OS=='win' and target_arch=='arm64'", {
          "include_dirs": ["lib/win-arm64"],
          "libraries": ["<(module_root_dir)/lib/win-arm64/libomt.lib"],
          "copies": [{
            "destination": "<(PRODUCT_DIR)",
            "files": [
              "lib/win-arm64/libomt.dll",
              "lib/win-arm64/libvmx.dll"
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
