// 候选“随包小工具”：调用 FileManager.trashItem，进废纸篓的同时记录“放回原处”所需信息。
// 用系统自带的 swiftc 编译，不引入任何依赖。输出每个条目在废纸篓里的最终路径。
import Foundation

var rc: Int32 = 0
for arg in CommandLine.arguments.dropFirst() {
    var out: NSURL?
    do {
        try FileManager.default.trashItem(at: URL(fileURLWithPath: arg), resultingItemURL: &out)
        print(out?.path ?? "?")
    } catch {
        FileHandle.standardError.write(Data("\(arg): \(error)\n".utf8))
        rc = 1
    }
}
exit(rc)
