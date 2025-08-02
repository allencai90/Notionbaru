import BLOG from '@/blog.config'
import { Feed } from 'feed'
import fs from 'fs'
import path from 'path'

/**
 * [最终稳定版]
 * 安全地清洗并生成RSS内容，优先保证部署不失败。
 * @param {object} post - 文章对象
 * @returns {Promise<string>} 清洗后的HTML内容
 */
const createFeedContent = async (post) => {
  // 1. 核心安全检查：确保 post 和 post.summary 是一个有效的字符串
  if (!post || typeof post.summary !== 'string' || post.summary.length === 0) {
    return ''
  }

  let content = post.summary

  // 2. 使用 try-catch 包裹所有清洗操作，确保任何正则错误都不会导致部署崩溃
  try {
    // 核心清洗逻辑：移除包含图标和所有属性的 <header> 区域
    // 使用 [\s\S] 保证跨行匹配的最高兼容性，并使用全局标志 'g'
    content = content.replace(/<header[\s\S]*?<\/header>/g, '')

    // 补充清洗：移除其他已知的不需要元素，同样保证安全
    content = content.replace(/<div class="notion-page-icon-inline"[\s\S]*?<\/div>/g, '')
    content = content.replace(/<div class="notion-collection-row"[\s\S]*?<\/div>/g, '')
  } catch (e) {
    // 如果清洗失败，在后台打印警告，但绝不中断程序
    console.warn(`[RSS-Warning] Failed to clean content for post: "${post.title}". Error:`, e)
    // 即使出错，也返回原始摘要，保证有内容输出
    return post.summary
  }
  
  // 3. 返回处理后的结果
  return content.trim()
}

/**
 * 生成RSS数据
 * @param {object} props
 */
export async function generateRss(props) {
  const { NOTION_CONFIG, siteInfo, latestPosts } = props
  const TITLE = siteInfo?.title
  const DESCRIPTION = siteInfo?.description
  const LINK = siteInfo?.link || BLOG.LINK
  const AUTHOR = NOTION_CONFIG?.AUTHOR || BLOG.AUTHOR
  const LANG = NOTION_CONFIG?.LANG || BLOG.LANG
  const SUB_PATH = NOTION_CONFIG?.SUB_PATH || BLOG.SUB_PATH
  const CONTACT_EMAIL = NOTION_CONFIG?.CONTACT_EMAIL || BLOG.CONTACT_EMAIL

  const rssPath = path.resolve('./public/rss/feed.xml')
  
  if (isFeedRecentlyUpdated(rssPath, 10)) {
    return
  }

  console.log('[RSS订阅] 生成 /rss/feed.xml')
  const year = new Date().getFullYear()
  const feed = new Feed({
    title: TITLE,
    description: DESCRIPTION,
    link: `${LINK}/${SUB_PATH}`,
    language: LANG,
    favicon: `${LINK}/favicon.png`,
    copyright: `All rights reserved ${year}, ${AUTHOR}`,
    author: { name: AUTHOR, email: CONTACT_EMAIL, link: LINK }
  })

  const latestPostsLimited = latestPosts.slice(0, 10)
  for (const post of latestPostsLimited) {
    // 安全地获取并清洗内容
    const cleanedContent = await createFeedContent(post)

    feed.addItem({
      title: post.title,
      link: `${BLOG.LINK}/${post.slug}`,
      // description 字段也使用清洗后的内容，使阅读器预览更干净
      description: cleanedContent, 
      // 必须使用 CDATA 包裹，防止 HTML 破坏 XML 结构
      content: `<![CDATA[${cleanedContent}]]>`,
      date: new Date(post?.publishDay)
    })
  }

  // 最后一步：写入文件
  try {
    fs.mkdirSync('./public/rss', { recursive: true })
    fs.writeFileSync(rssPath, feed.rss2())
    fs.writeFileSync(path.resolve('./public/rss/atom.xml'), feed.atom1())
    fs.writeFileSync(path.resolve('./public/rss/feed.json'), feed.json1())
  } catch (error) {
    console.warn('[RSS 生成失败] 可能运行在只读文件系统，已跳过写入')
  }
}

/**
 * 检查上次更新的辅助函数
 * @param {string} filePath
 * @param {number} intervalMinutes
 * @returns {boolean}
 */
function isFeedRecentlyUpdated(filePath, intervalMinutes = 60) {
  try {
    const stats = fs.statSync(filePath)
    return (Date.now() - stats.mtimeMs) < intervalMinutes * 60 * 1000
  } catch (error) {
    return false
  }
}
