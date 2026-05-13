#include <napi.h>
#include <memory>
#include <vector>
#include <string>
#include <cstring>
#include <cstdio>

#include "libomt.h"

// ============================================================
// Helpers
// ============================================================

static Napi::Object StatisticsToJS(Napi::Env env, const OMTStatistics& s) {
    auto obj = Napi::Object::New(env);
    obj.Set("bytesSent",               Napi::BigInt::New(env, s.BytesSent));
    obj.Set("bytesReceived",           Napi::BigInt::New(env, s.BytesReceived));
    obj.Set("bytesSentSinceLast",      Napi::BigInt::New(env, s.BytesSentSinceLast));
    obj.Set("bytesReceivedSinceLast",  Napi::BigInt::New(env, s.BytesReceivedSinceLast));
    obj.Set("frames",                  Napi::BigInt::New(env, s.Frames));
    obj.Set("framesSinceLast",         Napi::BigInt::New(env, s.FramesSinceLast));
    obj.Set("framesDropped",           Napi::BigInt::New(env, s.FramesDropped));
    obj.Set("codecTime",               Napi::BigInt::New(env, s.CodecTime));
    obj.Set("codecTimeSinceLast",      Napi::BigInt::New(env, s.CodecTimeSinceLast));
    return obj;
}

static Napi::Object FrameToJS(Napi::Env env, OMTMediaFrame* f) {
    auto obj = Napi::Object::New(env);
    obj.Set("type",             Napi::Number::New(env, (int)f->Type));
    obj.Set("timestamp",        Napi::BigInt::New(env, (int64_t)f->Timestamp));
    obj.Set("codec",            Napi::Number::New(env, (int)f->Codec));
    obj.Set("width",            Napi::Number::New(env, f->Width));
    obj.Set("height",           Napi::Number::New(env, f->Height));
    obj.Set("stride",           Napi::Number::New(env, f->Stride));
    obj.Set("flags",            Napi::Number::New(env, (int)f->Flags));
    obj.Set("frameRateN",       Napi::Number::New(env, f->FrameRateN));
    obj.Set("frameRateD",       Napi::Number::New(env, f->FrameRateD));
    obj.Set("aspectRatio",      Napi::Number::New(env, f->AspectRatio));
    obj.Set("colorSpace",       Napi::Number::New(env, (int)f->ColorSpace));
    obj.Set("sampleRate",       Napi::Number::New(env, f->SampleRate));
    obj.Set("channels",         Napi::Number::New(env, f->Channels));
    obj.Set("samplesPerChannel",Napi::Number::New(env, f->SamplesPerChannel));

    if (f->Data && f->DataLength > 0)
        obj.Set("data", Napi::Buffer<uint8_t>::Copy(env,
            static_cast<uint8_t*>(f->Data), f->DataLength));
    else
        obj.Set("data", env.Null());

    if (f->CompressedData && f->CompressedLength > 0)
        obj.Set("compressedData", Napi::Buffer<uint8_t>::Copy(env,
            static_cast<uint8_t*>(f->CompressedData), f->CompressedLength));
    else
        obj.Set("compressedData", env.Null());

    if (f->FrameMetadata && f->FrameMetadataLength > 0)
        obj.Set("frameMetadata", Napi::String::New(env,
            static_cast<char*>(f->FrameMetadata)));
    else
        obj.Set("frameMetadata", env.Null());

    return obj;
}

// Holds a deep copy of an OMTMediaFrame for use across thread boundaries
struct CopiedFrame {
    bool hasFrame = false;
    OMTMediaFrame frame = {};
    std::vector<uint8_t> data;
    std::vector<uint8_t> compressedData;
    std::string frameMetadata;

    void CopyFrom(OMTMediaFrame* f) {
        if (!f) return;
        hasFrame = true;
        frame = *f;
        if (f->Data && f->DataLength > 0) {
            data.assign(static_cast<uint8_t*>(f->Data),
                        static_cast<uint8_t*>(f->Data) + f->DataLength);
            frame.Data = data.data();
        } else {
            frame.Data = nullptr;
        }
        if (f->CompressedData && f->CompressedLength > 0) {
            compressedData.assign(static_cast<uint8_t*>(f->CompressedData),
                                  static_cast<uint8_t*>(f->CompressedData) + f->CompressedLength);
            frame.CompressedData = compressedData.data();
        } else {
            frame.CompressedData = nullptr;
        }
        if (f->FrameMetadata && f->FrameMetadataLength > 0) {
            frameMetadata.assign(static_cast<char*>(f->FrameMetadata));
            frame.FrameMetadata = const_cast<char*>(frameMetadata.c_str());
            frame.FrameMetadataLength = static_cast<int>(frameMetadata.size()) + 1;
        } else {
            frame.FrameMetadata = nullptr;
        }
    }

    Napi::Value ToJS(Napi::Env env) const {
        if (!hasFrame) return env.Null();
        return FrameToJS(env, const_cast<OMTMediaFrame*>(&frame));
    }
};

// Populate an OMTMediaFrame from a JS object for sending.
// Caller keeps frameObj alive for the duration of the send call.
static void JSToFrame(Napi::Object obj, OMTMediaFrame& frame,
                      std::string& metaBuf,
                      Napi::Buffer<uint8_t>& dataBuf, bool& hasDataBuf) {
    std::memset(&frame, 0, sizeof(frame));

    if (obj.Has("type"))
        frame.Type = (OMTFrameType)obj.Get("type").As<Napi::Number>().Int32Value();
    if (obj.Has("timestamp") && obj.Get("timestamp").IsBigInt()) {
        bool lossless;
        frame.Timestamp = obj.Get("timestamp").As<Napi::BigInt>().Int64Value(&lossless);
    } else {
        frame.Timestamp = -1; // let the library generate timestamps
    }
    if (obj.Has("codec"))
        frame.Codec = (OMTCodec)obj.Get("codec").As<Napi::Number>().Int32Value();
    if (obj.Has("width"))        frame.Width   = obj.Get("width").As<Napi::Number>().Int32Value();
    if (obj.Has("height"))       frame.Height  = obj.Get("height").As<Napi::Number>().Int32Value();
    if (obj.Has("stride"))       frame.Stride  = obj.Get("stride").As<Napi::Number>().Int32Value();
    if (obj.Has("flags"))
        frame.Flags = (OMTVideoFlags)obj.Get("flags").As<Napi::Number>().Int32Value();
    if (obj.Has("frameRateN"))   frame.FrameRateN = obj.Get("frameRateN").As<Napi::Number>().Int32Value();
    if (obj.Has("frameRateD"))   frame.FrameRateD = obj.Get("frameRateD").As<Napi::Number>().Int32Value();
    if (obj.Has("aspectRatio"))  frame.AspectRatio = obj.Get("aspectRatio").As<Napi::Number>().FloatValue();
    if (obj.Has("colorSpace"))
        frame.ColorSpace = (OMTColorSpace)obj.Get("colorSpace").As<Napi::Number>().Int32Value();
    if (obj.Has("sampleRate"))        frame.SampleRate        = obj.Get("sampleRate").As<Napi::Number>().Int32Value();
    if (obj.Has("channels"))          frame.Channels          = obj.Get("channels").As<Napi::Number>().Int32Value();
    if (obj.Has("samplesPerChannel")) frame.SamplesPerChannel = obj.Get("samplesPerChannel").As<Napi::Number>().Int32Value();

    if (obj.Has("data") && obj.Get("data").IsBuffer()) {
        dataBuf    = obj.Get("data").As<Napi::Buffer<uint8_t>>();
        hasDataBuf = true;
        frame.Data       = dataBuf.Data();
        frame.DataLength = static_cast<int>(dataBuf.ByteLength());
    }
    if (obj.Has("frameMetadata") && obj.Get("frameMetadata").IsString()) {
        metaBuf = obj.Get("frameMetadata").As<Napi::String>().Utf8Value();
        frame.FrameMetadata       = const_cast<char*>(metaBuf.c_str());
        frame.FrameMetadataLength = static_cast<int>(metaBuf.size()) + 1;
    }
}

// Safe cross-platform strncpy
static void SafeStrCopy(char* dst, const char* src, size_t maxLen) {
    std::snprintf(dst, maxLen, "%s", src);
}

// ============================================================
// Async workers
// ============================================================

class ReceiveFrameWorker : public Napi::AsyncWorker {
public:
    ReceiveFrameWorker(Napi::Env env, omt_receive_t* inst, OMTFrameType ft, int ms)
        : Napi::AsyncWorker(env),
          deferred_(Napi::Promise::Deferred::New(env)),
          inst_(inst), frameTypes_(ft), timeout_(ms) {}

    Napi::Promise GetPromise() { return deferred_.Promise(); }
    void Execute() override { result_.CopyFrom(omt_receive(inst_, frameTypes_, timeout_)); }
    void OnOK()    override { deferred_.Resolve(result_.ToJS(Env())); }
    void OnError(const Napi::Error& e) override { deferred_.Reject(e.Value()); }

private:
    Napi::Promise::Deferred deferred_;
    omt_receive_t* inst_;
    OMTFrameType frameTypes_;
    int timeout_;
    CopiedFrame result_;
};

class SendReceiveWorker : public Napi::AsyncWorker {
public:
    SendReceiveWorker(Napi::Env env, omt_send_t* inst, int ms)
        : Napi::AsyncWorker(env),
          deferred_(Napi::Promise::Deferred::New(env)),
          inst_(inst), timeout_(ms) {}

    Napi::Promise GetPromise() { return deferred_.Promise(); }
    void Execute() override { result_.CopyFrom(omt_send_receive(inst_, timeout_)); }
    void OnOK()    override { deferred_.Resolve(result_.ToJS(Env())); }
    void OnError(const Napi::Error& e) override { deferred_.Reject(e.Value()); }

private:
    Napi::Promise::Deferred deferred_;
    omt_send_t* inst_;
    int timeout_;
    CopiedFrame result_;
};

class ReceiveGetTallyWorker : public Napi::AsyncWorker {
public:
    ReceiveGetTallyWorker(Napi::Env env, omt_receive_t* inst, int ms)
        : Napi::AsyncWorker(env),
          deferred_(Napi::Promise::Deferred::New(env)),
          inst_(inst), timeout_(ms) {}

    Napi::Promise GetPromise() { return deferred_.Promise(); }
    void Execute() override { changed_ = omt_receive_gettally(inst_, timeout_, &tally_); }
    void OnOK() override {
        Napi::Env env = Env();
        auto res   = Napi::Object::New(env);
        auto tObj  = Napi::Object::New(env);
        tObj.Set("preview", Napi::Number::New(env, tally_.preview));
        tObj.Set("program", Napi::Number::New(env, tally_.program));
        res.Set("changed", Napi::Number::New(env, changed_));
        res.Set("tally", tObj);
        deferred_.Resolve(res);
    }
    void OnError(const Napi::Error& e) override { deferred_.Reject(e.Value()); }

private:
    Napi::Promise::Deferred deferred_;
    omt_receive_t* inst_;
    int timeout_;
    int changed_ = 0;
    OMTTally tally_ = {};
};

class SendGetTallyWorker : public Napi::AsyncWorker {
public:
    SendGetTallyWorker(Napi::Env env, omt_send_t* inst, int ms)
        : Napi::AsyncWorker(env),
          deferred_(Napi::Promise::Deferred::New(env)),
          inst_(inst), timeout_(ms) {}

    Napi::Promise GetPromise() { return deferred_.Promise(); }
    void Execute() override { changed_ = omt_send_gettally(inst_, timeout_, &tally_); }
    void OnOK() override {
        Napi::Env env = Env();
        auto res   = Napi::Object::New(env);
        auto tObj  = Napi::Object::New(env);
        tObj.Set("preview", Napi::Number::New(env, tally_.preview));
        tObj.Set("program", Napi::Number::New(env, tally_.program));
        res.Set("changed", Napi::Number::New(env, changed_));
        res.Set("tally", tObj);
        deferred_.Resolve(res);
    }
    void OnError(const Napi::Error& e) override { deferred_.Reject(e.Value()); }

private:
    Napi::Promise::Deferred deferred_;
    omt_send_t* inst_;
    int timeout_;
    int changed_ = 0;
    OMTTally tally_ = {};
};

// ============================================================
// Discovery
// ============================================================

Napi::Value DiscoveryGetAddresses(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    int count = 0;
    char** addrs = omt_discovery_getaddresses(&count);
    auto result = Napi::Array::New(env, count);
    for (int i = 0; i < count; i++)
        result[i] = Napi::String::New(env, addrs[i]);
    return result;
}

// ============================================================
// Receive
// ============================================================

Napi::Value ReceiveCreate(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 4) {
        Napi::TypeError::New(env, "Expected: address, frameTypes, format, flags")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    std::string address = info[0].As<Napi::String>().Utf8Value();
    auto frameTypes = (OMTFrameType)info[1].As<Napi::Number>().Int32Value();
    auto format     = (OMTPreferredVideoFormat)info[2].As<Napi::Number>().Int32Value();
    auto flags      = (OMTReceiveFlags)info[3].As<Napi::Number>().Int32Value();

    omt_receive_t* inst = omt_receive_create(address.c_str(), frameTypes, format, flags);
    if (!inst) return env.Null();
    return Napi::External<omt_receive_t>::New(env, inst);
}

Napi::Value ReceiveDestroy(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsExternal()) {
        Napi::TypeError::New(env, "Expected: receive instance").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    omt_receive_destroy(info[0].As<Napi::External<omt_receive_t>>().Data());
    return env.Undefined();
}

Napi::Value Receive(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 3 || !info[0].IsExternal()) {
        Napi::TypeError::New(env, "Expected: instance, frameTypes, timeoutMs")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    auto* inst = info[0].As<Napi::External<omt_receive_t>>().Data();
    auto ft    = (OMTFrameType)info[1].As<Napi::Number>().Int32Value();
    int  ms    = info[2].As<Napi::Number>().Int32Value();

    auto* worker = new ReceiveFrameWorker(env, inst, ft, ms);
    worker->Queue();
    return worker->GetPromise();
}

Napi::Value ReceiveSend(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsExternal() || !info[1].IsObject()) {
        Napi::TypeError::New(env, "Expected: instance, frame").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    auto* inst  = info[0].As<Napi::External<omt_receive_t>>().Data();
    auto  fObj  = info[1].As<Napi::Object>();

    OMTMediaFrame frame = {};
    std::string metaBuf;
    Napi::Buffer<uint8_t> dataBuf;
    bool hasDataBuf = false;
    JSToFrame(fObj, frame, metaBuf, dataBuf, hasDataBuf);

    return Napi::Number::New(env, omt_receive_send(inst, &frame));
}

Napi::Value ReceiveSetTally(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsExternal() || !info[1].IsObject()) {
        Napi::TypeError::New(env, "Expected: instance, tally").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    auto* inst = info[0].As<Napi::External<omt_receive_t>>().Data();
    auto  tObj = info[1].As<Napi::Object>();
    OMTTally tally = {};
    if (tObj.Has("preview")) tally.preview = tObj.Get("preview").As<Napi::Number>().Int32Value();
    if (tObj.Has("program")) tally.program = tObj.Get("program").As<Napi::Number>().Int32Value();
    omt_receive_settally(inst, &tally);
    return env.Undefined();
}

Napi::Value ReceiveGetTally(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsExternal()) {
        Napi::TypeError::New(env, "Expected: instance, timeoutMs").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    auto* inst = info[0].As<Napi::External<omt_receive_t>>().Data();
    int   ms   = info[1].As<Napi::Number>().Int32Value();
    auto* worker = new ReceiveGetTallyWorker(env, inst, ms);
    worker->Queue();
    return worker->GetPromise();
}

Napi::Value ReceiveSetFlags(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsExternal()) {
        Napi::TypeError::New(env, "Expected: instance, flags").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    auto* inst = info[0].As<Napi::External<omt_receive_t>>().Data();
    omt_receive_setflags(inst, (OMTReceiveFlags)info[1].As<Napi::Number>().Int32Value());
    return env.Undefined();
}

Napi::Value ReceiveSetSuggestedQuality(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsExternal()) {
        Napi::TypeError::New(env, "Expected: instance, quality").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    auto* inst = info[0].As<Napi::External<omt_receive_t>>().Data();
    omt_receive_setsuggestedquality(inst, (OMTQuality)info[1].As<Napi::Number>().Int32Value());
    return env.Undefined();
}

Napi::Value ReceiveGetSenderInformation(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsExternal()) {
        Napi::TypeError::New(env, "Expected: instance").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    auto* inst = info[0].As<Napi::External<omt_receive_t>>().Data();
    OMTSenderInfo si = {};
    omt_receive_getsenderinformation(inst, &si);
    auto obj = Napi::Object::New(env);
    obj.Set("productName",  Napi::String::New(env, si.ProductName));
    obj.Set("manufacturer", Napi::String::New(env, si.Manufacturer));
    obj.Set("version",      Napi::String::New(env, si.Version));
    return obj;
}

Napi::Value ReceiveGetVideoStatistics(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsExternal()) {
        Napi::TypeError::New(env, "Expected: instance").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    OMTStatistics stats = {};
    omt_receive_getvideostatistics(info[0].As<Napi::External<omt_receive_t>>().Data(), &stats);
    return StatisticsToJS(env, stats);
}

Napi::Value ReceiveGetAudioStatistics(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsExternal()) {
        Napi::TypeError::New(env, "Expected: instance").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    OMTStatistics stats = {};
    omt_receive_getaudiostatistics(info[0].As<Napi::External<omt_receive_t>>().Data(), &stats);
    return StatisticsToJS(env, stats);
}

// ============================================================
// Send
// ============================================================

Napi::Value SendCreate(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2) {
        Napi::TypeError::New(env, "Expected: name, quality").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    std::string name = info[0].As<Napi::String>().Utf8Value();
    auto quality     = (OMTQuality)info[1].As<Napi::Number>().Int32Value();

    omt_send_t* inst = omt_send_create(name.c_str(), quality);
    if (!inst) return env.Null();
    return Napi::External<omt_send_t>::New(env, inst);
}

Napi::Value SendSetSenderInformation(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsExternal() || !info[1].IsObject()) {
        Napi::TypeError::New(env, "Expected: instance, info").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    auto* inst = info[0].As<Napi::External<omt_send_t>>().Data();
    auto  iObj = info[1].As<Napi::Object>();
    OMTSenderInfo si = {};
    if (iObj.Has("productName"))
        SafeStrCopy(si.ProductName,  iObj.Get("productName").As<Napi::String>().Utf8Value().c_str(),  OMT_MAX_STRING_LENGTH);
    if (iObj.Has("manufacturer"))
        SafeStrCopy(si.Manufacturer, iObj.Get("manufacturer").As<Napi::String>().Utf8Value().c_str(), OMT_MAX_STRING_LENGTH);
    if (iObj.Has("version"))
        SafeStrCopy(si.Version,      iObj.Get("version").As<Napi::String>().Utf8Value().c_str(),      OMT_MAX_STRING_LENGTH);
    omt_send_setsenderinformation(inst, &si);
    return env.Undefined();
}

Napi::Value SendAddConnectionMetadata(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsExternal()) {
        Napi::TypeError::New(env, "Expected: instance, metadata").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    auto* inst = info[0].As<Napi::External<omt_send_t>>().Data();
    std::string meta = info[1].As<Napi::String>().Utf8Value();
    omt_send_addconnectionmetadata(inst, meta.c_str());
    return env.Undefined();
}

Napi::Value SendClearConnectionMetadata(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsExternal()) {
        Napi::TypeError::New(env, "Expected: instance").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    omt_send_clearconnectionmetadata(info[0].As<Napi::External<omt_send_t>>().Data());
    return env.Undefined();
}

Napi::Value SendSetRedirect(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsExternal()) {
        Napi::TypeError::New(env, "Expected: instance[, newAddress]").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    auto* inst = info[0].As<Napi::External<omt_send_t>>().Data();
    std::string addrStr;
    const char* addr = nullptr;
    if (info.Length() >= 2 && info[1].IsString()) {
        addrStr = info[1].As<Napi::String>().Utf8Value();
        addr = addrStr.c_str();
    }
    omt_send_setredirect(inst, addr);
    return env.Undefined();
}

Napi::Value SendGetAddress(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsExternal()) {
        Napi::TypeError::New(env, "Expected: instance").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    auto* inst = info[0].As<Napi::External<omt_send_t>>().Data();
    char buf[OMT_MAX_STRING_LENGTH] = {};
    omt_send_getaddress(inst, buf, OMT_MAX_STRING_LENGTH);
    return Napi::String::New(env, buf);
}

Napi::Value SendDestroy(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsExternal()) {
        Napi::TypeError::New(env, "Expected: send instance").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    omt_send_destroy(info[0].As<Napi::External<omt_send_t>>().Data());
    return env.Undefined();
}

Napi::Value Send(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsExternal() || !info[1].IsObject()) {
        Napi::TypeError::New(env, "Expected: instance, frame").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    auto* inst = info[0].As<Napi::External<omt_send_t>>().Data();
    auto  fObj = info[1].As<Napi::Object>();

    OMTMediaFrame frame = {};
    std::string metaBuf;
    Napi::Buffer<uint8_t> dataBuf;
    bool hasDataBuf = false;
    JSToFrame(fObj, frame, metaBuf, dataBuf, hasDataBuf);

    return Napi::Number::New(env, omt_send(inst, &frame));
}

Napi::Value SendConnections(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsExternal()) {
        Napi::TypeError::New(env, "Expected: instance").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    return Napi::Number::New(env, omt_send_connections(info[0].As<Napi::External<omt_send_t>>().Data()));
}

Napi::Value SendReceive(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsExternal()) {
        Napi::TypeError::New(env, "Expected: instance, timeoutMs").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    auto* inst = info[0].As<Napi::External<omt_send_t>>().Data();
    int   ms   = info[1].As<Napi::Number>().Int32Value();
    auto* worker = new SendReceiveWorker(env, inst, ms);
    worker->Queue();
    return worker->GetPromise();
}

Napi::Value SendGetTally(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsExternal()) {
        Napi::TypeError::New(env, "Expected: instance, timeoutMs").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    auto* inst = info[0].As<Napi::External<omt_send_t>>().Data();
    int   ms   = info[1].As<Napi::Number>().Int32Value();
    auto* worker = new SendGetTallyWorker(env, inst, ms);
    worker->Queue();
    return worker->GetPromise();
}

Napi::Value SendGetVideoStatistics(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsExternal()) {
        Napi::TypeError::New(env, "Expected: instance").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    OMTStatistics stats = {};
    omt_send_getvideostatistics(info[0].As<Napi::External<omt_send_t>>().Data(), &stats);
    return StatisticsToJS(env, stats);
}

Napi::Value SendGetAudioStatistics(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsExternal()) {
        Napi::TypeError::New(env, "Expected: instance").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    OMTStatistics stats = {};
    omt_send_getaudiostatistics(info[0].As<Napi::External<omt_send_t>>().Data(), &stats);
    return StatisticsToJS(env, stats);
}

// ============================================================
// Logging
// ============================================================

Napi::Value SetLoggingFilename(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    std::string fnStr;
    const char* fn = nullptr;
    if (info.Length() >= 1 && info[0].IsString()) {
        fnStr = info[0].As<Napi::String>().Utf8Value();
        fn = fnStr.c_str();
    }
    omt_setloggingfilename(fn);
    return env.Undefined();
}

// ============================================================
// Settings
// ============================================================

Napi::Value SettingsGetString(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1) {
        Napi::TypeError::New(env, "Expected: name").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    std::string name = info[0].As<Napi::String>().Utf8Value();
    char value[OMT_MAX_STRING_LENGTH] = {};
    omt_settings_get_string(name.c_str(), value, OMT_MAX_STRING_LENGTH);
    return Napi::String::New(env, value);
}

Napi::Value SettingsSetString(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2) {
        Napi::TypeError::New(env, "Expected: name, value").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    std::string name  = info[0].As<Napi::String>().Utf8Value();
    std::string value = info[1].As<Napi::String>().Utf8Value();
    omt_settings_set_string(name.c_str(), value.c_str());
    return env.Undefined();
}

Napi::Value SettingsGetInteger(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1) {
        Napi::TypeError::New(env, "Expected: name").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    std::string name = info[0].As<Napi::String>().Utf8Value();
    return Napi::Number::New(env, omt_settings_get_integer(name.c_str()));
}

Napi::Value SettingsSetInteger(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2) {
        Napi::TypeError::New(env, "Expected: name, value").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    std::string name = info[0].As<Napi::String>().Utf8Value();
    int         val  = info[1].As<Napi::Number>().Int32Value();
    omt_settings_set_integer(name.c_str(), val);
    return env.Undefined();
}

// ============================================================
// Module initialisation
// ============================================================

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    // Discovery
    exports.Set("discoveryGetAddresses",       Napi::Function::New(env, DiscoveryGetAddresses));

    // Receive
    exports.Set("receiveCreate",               Napi::Function::New(env, ReceiveCreate));
    exports.Set("receiveDestroy",              Napi::Function::New(env, ReceiveDestroy));
    exports.Set("receive",                     Napi::Function::New(env, Receive));
    exports.Set("receiveSend",                 Napi::Function::New(env, ReceiveSend));
    exports.Set("receiveSetTally",             Napi::Function::New(env, ReceiveSetTally));
    exports.Set("receiveGetTally",             Napi::Function::New(env, ReceiveGetTally));
    exports.Set("receiveSetFlags",             Napi::Function::New(env, ReceiveSetFlags));
    exports.Set("receiveSetSuggestedQuality",  Napi::Function::New(env, ReceiveSetSuggestedQuality));
    exports.Set("receiveGetSenderInformation", Napi::Function::New(env, ReceiveGetSenderInformation));
    exports.Set("receiveGetVideoStatistics",   Napi::Function::New(env, ReceiveGetVideoStatistics));
    exports.Set("receiveGetAudioStatistics",   Napi::Function::New(env, ReceiveGetAudioStatistics));

    // Send
    exports.Set("sendCreate",                  Napi::Function::New(env, SendCreate));
    exports.Set("sendSetSenderInformation",    Napi::Function::New(env, SendSetSenderInformation));
    exports.Set("sendAddConnectionMetadata",   Napi::Function::New(env, SendAddConnectionMetadata));
    exports.Set("sendClearConnectionMetadata", Napi::Function::New(env, SendClearConnectionMetadata));
    exports.Set("sendSetRedirect",             Napi::Function::New(env, SendSetRedirect));
    exports.Set("sendGetAddress",              Napi::Function::New(env, SendGetAddress));
    exports.Set("sendDestroy",                 Napi::Function::New(env, SendDestroy));
    exports.Set("send",                        Napi::Function::New(env, Send));
    exports.Set("sendConnections",             Napi::Function::New(env, SendConnections));
    exports.Set("sendReceive",                 Napi::Function::New(env, SendReceive));
    exports.Set("sendGetTally",                Napi::Function::New(env, SendGetTally));
    exports.Set("sendGetVideoStatistics",      Napi::Function::New(env, SendGetVideoStatistics));
    exports.Set("sendGetAudioStatistics",      Napi::Function::New(env, SendGetAudioStatistics));

    // Logging
    exports.Set("setLoggingFilename",          Napi::Function::New(env, SetLoggingFilename));

    // Settings
    exports.Set("settingsGetString",           Napi::Function::New(env, SettingsGetString));
    exports.Set("settingsSetString",           Napi::Function::New(env, SettingsSetString));
    exports.Set("settingsGetInteger",          Napi::Function::New(env, SettingsGetInteger));
    exports.Set("settingsSetInteger",          Napi::Function::New(env, SettingsSetInteger));

    // Enums
    auto FrameType = Napi::Object::New(env);
    FrameType.Set("None",     Napi::Number::New(env, OMTFrameType_None));
    FrameType.Set("Metadata", Napi::Number::New(env, OMTFrameType_Metadata));
    FrameType.Set("Video",    Napi::Number::New(env, OMTFrameType_Video));
    FrameType.Set("Audio",    Napi::Number::New(env, OMTFrameType_Audio));
    exports.Set("FrameType", FrameType);

    auto Codec = Napi::Object::New(env);
    Codec.Set("VMX1", Napi::Number::New(env, OMTCodec_VMX1));
    Codec.Set("FPA1", Napi::Number::New(env, OMTCodec_FPA1));
    Codec.Set("UYVY", Napi::Number::New(env, OMTCodec_UYVY));
    Codec.Set("YUY2", Napi::Number::New(env, OMTCodec_YUY2));
    Codec.Set("BGRA", Napi::Number::New(env, OMTCodec_BGRA));
    Codec.Set("NV12", Napi::Number::New(env, OMTCodec_NV12));
    Codec.Set("YV12", Napi::Number::New(env, OMTCodec_YV12));
    Codec.Set("UYVA", Napi::Number::New(env, OMTCodec_UYVA));
    Codec.Set("P216", Napi::Number::New(env, OMTCodec_P216));
    Codec.Set("PA16", Napi::Number::New(env, OMTCodec_PA16));
    exports.Set("Codec", Codec);

    auto Quality = Napi::Object::New(env);
    Quality.Set("Default", Napi::Number::New(env, OMTQuality_Default));
    Quality.Set("Low",     Napi::Number::New(env, OMTQuality_Low));
    Quality.Set("Medium",  Napi::Number::New(env, OMTQuality_Medium));
    Quality.Set("High",    Napi::Number::New(env, OMTQuality_High));
    exports.Set("Quality", Quality);

    auto ColorSpace = Napi::Object::New(env);
    ColorSpace.Set("Undefined", Napi::Number::New(env, OMTColorSpace_Undefined));
    ColorSpace.Set("BT601",     Napi::Number::New(env, OMTColorSpace_BT601));
    ColorSpace.Set("BT709",     Napi::Number::New(env, OMTColorSpace_BT709));
    exports.Set("ColorSpace", ColorSpace);

    auto VideoFlags = Napi::Object::New(env);
    VideoFlags.Set("None",          Napi::Number::New(env, OMTVideoFlags_None));
    VideoFlags.Set("Interlaced",    Napi::Number::New(env, OMTVideoFlags_Interlaced));
    VideoFlags.Set("Alpha",         Napi::Number::New(env, OMTVideoFlags_Alpha));
    VideoFlags.Set("PreMultiplied", Napi::Number::New(env, OMTVideoFlags_PreMultiplied));
    VideoFlags.Set("Preview",       Napi::Number::New(env, OMTVideoFlags_Preview));
    VideoFlags.Set("HighBitDepth",  Napi::Number::New(env, OMTVideoFlags_HighBitDepth));
    exports.Set("VideoFlags", VideoFlags);

    auto PreferredVideoFormat = Napi::Object::New(env);
    PreferredVideoFormat.Set("UYVY",                    Napi::Number::New(env, OMTPreferredVideoFormat_UYVY));
    PreferredVideoFormat.Set("UYVYorBGRA",              Napi::Number::New(env, OMTPreferredVideoFormat_UYVYorBGRA));
    PreferredVideoFormat.Set("BGRA",                    Napi::Number::New(env, OMTPreferredVideoFormat_BGRA));
    PreferredVideoFormat.Set("UYVYorUYVA",              Napi::Number::New(env, OMTPreferredVideoFormat_UYVYorUYVA));
    PreferredVideoFormat.Set("UYVYorUYVAorP216orPA16",  Napi::Number::New(env, OMTPreferredVideoFormat_UYVYorUYVAorP216orPA16));
    PreferredVideoFormat.Set("P216",                    Napi::Number::New(env, OMTPreferredVideoFormat_P216));
    exports.Set("PreferredVideoFormat", PreferredVideoFormat);

    auto ReceiveFlags = Napi::Object::New(env);
    ReceiveFlags.Set("None",             Napi::Number::New(env, OMTReceiveFlags_None));
    ReceiveFlags.Set("Preview",          Napi::Number::New(env, OMTReceiveFlags_Preview));
    ReceiveFlags.Set("IncludeCompressed",Napi::Number::New(env, OMTReceiveFlags_IncludeCompressed));
    ReceiveFlags.Set("CompressedOnly",   Napi::Number::New(env, OMTReceiveFlags_CompressedOnly));
    exports.Set("ReceiveFlags", ReceiveFlags);

    return exports;
}

NODE_API_MODULE(omt, Init)
