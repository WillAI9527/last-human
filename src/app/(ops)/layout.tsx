import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "狼群账号运营中心" },
  description: "添加账号、回答小狼的问题、保存分析、对比一个竞品、生成文案并手动标记已发布。",
};

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return <div className="ops-root">{children}</div>;
}
