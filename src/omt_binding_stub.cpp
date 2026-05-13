#include <napi.h>

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    Napi::Error::New(env, "openmediatransport native addon is not available on Linux")
        .ThrowAsJavaScriptException();
    return exports;
}

NODE_API_MODULE(omt, Init)
